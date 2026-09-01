"""
PostgreSQL-backed document store with a Motor-like async API.

Each logical collection is stored as JSONB rows in one table so the FastAPI
handlers can keep their existing query shapes while running on Postgres.
"""
from __future__ import annotations

import copy
import json
import os
import re
import uuid
from typing import Any, AsyncIterator, Optional

import asyncpg

_POOL: Optional[asyncpg.Pool] = None


def _normalize_database_url(url: str) -> str:
    """Railway and many providers ship postgresql://; asyncpg wants postgres://."""
    if url.startswith("postgresql+asyncpg://"):
        url = "postgresql://" + url[len("postgresql+asyncpg://") :]
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    return url


def _ssl_from_url(url: str):
    """Enable TLS for public Railway URLs; skip for *.railway.internal."""
    lower = url.lower()
    if "railway.internal" in lower:
        return False
    if "sslmode=disable" in lower:
        return False
    if "localhost" in lower or "127.0.0.1" in lower:
        return False
    return True


async def init_pool() -> asyncpg.Pool:
    global _POOL
    if _POOL is not None:
        return _POOL
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is required (PostgreSQL connection string)")
    url = _normalize_database_url(url)
    ssl = _ssl_from_url(url)
    _POOL = await asyncpg.create_pool(
        url, min_size=1, max_size=10, command_timeout=60, ssl=ssl
    )
    async with _POOL.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                pk UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                collection TEXT NOT NULL,
                data JSONB NOT NULL
            );
            CREATE INDEX IF NOT EXISTS documents_collection_idx
                ON documents (collection);
            CREATE INDEX IF NOT EXISTS documents_data_gin
                ON documents USING GIN (data jsonb_path_ops);
            """
        )
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS email_verifications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT NOT NULL,
                purpose TEXT NOT NULL DEFAULT 'signup',
                otp_hash TEXT NOT NULL,
                attempts INT NOT NULL DEFAULT 0,
                max_attempts INT NOT NULL DEFAULT 5,
                send_count INT NOT NULL DEFAULT 1,
                expires_at TIMESTAMPTZ NOT NULL,
                consumed_at TIMESTAMPTZ,
                last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                token_jti UUID,
                token_consumed_at TIMESTAMPTZ
            );
            CREATE INDEX IF NOT EXISTS email_verifications_email_purpose_idx
                ON email_verifications (email, purpose, created_at DESC);
            CREATE INDEX IF NOT EXISTS email_verifications_expires_at_idx
                ON email_verifications (expires_at);

            CREATE TABLE IF NOT EXISTS auth_rate_limits (
                bucket_key TEXT NOT NULL,
                window_start TIMESTAMPTZ NOT NULL,
                count INT NOT NULL DEFAULT 1,
                PRIMARY KEY (bucket_key, window_start)
            );
            """
        )
    return _POOL


async def get_pool() -> asyncpg.Pool:
    """Return the shared asyncpg pool (initializes on first use)."""
    return await init_pool()


async def close_pool() -> None:
    global _POOL
    if _POOL is not None:
        await _POOL.close()
        _POOL = None


def _apply_projection(doc: dict, projection: Optional[dict]) -> dict:
    if not projection:
        out = dict(doc)
        out.pop("_id", None)
        return out
    # Inclusion vs exclusion: Mongo treats presence of any non-_id 1 as inclusion
    include_keys = [k for k, v in projection.items() if k != "_id" and v]
    exclude_keys = [k for k, v in projection.items() if k != "_id" and not v]
    if include_keys:
        out = {k: doc[k] for k in include_keys if k in doc}
        return out
    out = dict(doc)
    for k in exclude_keys:
        out.pop(k, None)
    out.pop("_id", None)
    return out


def _match_value(actual: Any, expected: Any) -> bool:
    if isinstance(expected, dict) and any(str(k).startswith("$") for k in expected):
        for op, val in expected.items():
            if op == "$regex":
                flags = re.IGNORECASE if "i" in str(expected.get("$options", "")) else 0
                if actual is None or not re.search(str(val), str(actual), flags):
                    return False
            elif op == "$options":
                continue
            elif op == "$in":
                if isinstance(actual, list):
                    if not any(v in actual for v in val):
                        return False
                else:
                    if actual not in val:
                        return False
            elif op == "$gte":
                if actual is None or actual < val:
                    return False
            elif op == "$lte":
                if actual is None or actual > val:
                    return False
            elif op == "$gt":
                if actual is None or actual <= val:
                    return False
            elif op == "$lt":
                if actual is None or actual >= val:
                    return False
            elif op == "$ne":
                if actual == val:
                    return False
            elif op == "$exists":
                exists = actual is not None  # field present checked by caller via sentinel
                # For $exists we need field presence; handled in _match_doc
                if bool(val) != exists:
                    return False
            else:
                return False
        return True
    return actual == expected


def _match_doc(doc: dict, query: dict) -> bool:
    if not query:
        return True
    if "$or" in query:
        others = {k: v for k, v in query.items() if k != "$or"}
        if others and not _match_doc(doc, others):
            return False
        return any(_match_doc(doc, clause) for clause in query["$or"])
    if "$and" in query:
        return all(_match_doc(doc, clause) for clause in query["$and"])

    for key, expected in query.items():
        if key.startswith("$"):
            continue
        if key == "_id":
            # Postgres layer never exposes Mongo ObjectIds; ignore legacy filters
            continue
        if isinstance(expected, dict) and "$exists" in expected:
            exists = key in doc
            if bool(expected["$exists"]) != exists:
                return False
            rest = {k: v for k, v in expected.items() if k != "$exists"}
            if rest and not _match_value(doc.get(key), rest):
                return False
            continue
        if not _match_value(doc.get(key), expected):
            return False
    return True


def _apply_update(doc: dict, update: dict) -> dict:
    doc = copy.deepcopy(doc)
    if "$set" in update:
        for k, v in update["$set"].items():
            doc[k] = v
    if "$unset" in update:
        for k in update["$unset"]:
            doc.pop(k, None)
    if "$inc" in update:
        for k, v in update["$inc"].items():
            doc[k] = (doc.get(k) or 0) + v
    if "$push" in update:
        for k, v in update["$push"].items():
            arr = list(doc.get(k) or [])
            arr.append(v)
            doc[k] = arr
    if "$pull" in update:
        for k, cond in update["$pull"].items():
            arr = list(doc.get(k) or [])
            if isinstance(cond, dict):
                doc[k] = [item for item in arr if not _match_doc(item if isinstance(item, dict) else {}, cond)]
            else:
                doc[k] = [item for item in arr if item != cond]
    # Bare fields (non-operator) treated as $set for safety
    for k, v in update.items():
        if not str(k).startswith("$"):
            doc[k] = v
    return doc


def _sort_key(doc: dict, field: str):
    v = doc.get(field)
    return (v is None, v)


class Cursor:
    def __init__(self, docs: list[dict]):
        self._docs = docs
        self._i = 0

    def sort(self, key: str, direction: int = 1):
        reverse = direction < 0
        self._docs.sort(key=lambda d: _sort_key(d, key), reverse=reverse)
        return self

    def limit(self, n: int):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length: Optional[int] = None) -> list[dict]:
        if length is None:
            return list(self._docs)
        return list(self._docs[:length])

    def __aiter__(self) -> AsyncIterator[dict]:
        return self

    async def __anext__(self) -> dict:
        if self._i >= len(self._docs):
            raise StopAsyncIteration
        doc = self._docs[self._i]
        self._i += 1
        return doc


class Collection:
    def __init__(self, name: str):
        self.name = name

    async def _all(self) -> list[tuple[str, dict]]:
        pool = await init_pool()
        async with pool.acquire() as conn:
            # Stable order so find_one / update_one hit the same row when
            # duplicate documents exist for one logical id (e.g. user_id).
            rows = await conn.fetch(
                "SELECT pk::text, data FROM documents WHERE collection = $1 ORDER BY pk",
                self.name,
            )
        out = []
        for r in rows:
            data = r["data"]
            if isinstance(data, str):
                data = json.loads(data)
            out.append((r["pk"], dict(data)))
        return out

    async def _save(self, pk: str, doc: dict) -> None:
        pool = await init_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE documents SET data = $1::jsonb WHERE pk = $2::uuid",
                json.dumps(doc, default=str),
                pk,
            )

    async def _insert_raw(self, doc: dict) -> str:
        pool = await init_pool()
        pk = str(uuid.uuid4())
        payload = json.dumps(doc, default=str)
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO documents (pk, collection, data) VALUES ($1::uuid, $2, $3::jsonb)",
                pk,
                self.name,
                payload,
            )
        return pk

    async def find_one(self, query: dict, projection: Optional[dict] = None) -> Optional[dict]:
        for _pk, doc in await self._all():
            if _match_doc(doc, query or {}):
                return _apply_projection(doc, projection)
        return None

    def find(self, query: Optional[dict] = None, projection: Optional[dict] = None) -> Cursor:
        # Materialize async later — callers always await to_list / async for
        return _LazyCursor(self, query or {}, projection)

    async def insert_one(self, doc: dict):
        clean = {k: v for k, v in doc.items() if k != "_id"}
        await self._insert_raw(clean)
        return type("R", (), {"inserted_id": clean.get("id")})()

    async def insert_many(self, docs: list[dict]):
        for d in docs:
            await self.insert_one(d)

    async def update_one(self, query: dict, update: dict, upsert: bool = False):
        rows = await self._all()
        for pk, doc in rows:
            if _match_doc(doc, query or {}):
                new_doc = _apply_update(doc, update)
                await self._save(pk, new_doc)
                return type("R", (), {"matched_count": 1, "modified_count": 1})()
        if upsert:
            base = dict(query or {})
            # Drop operator keys from filter when building upsert doc
            base = {k: v for k, v in base.items() if not str(k).startswith("$") and not isinstance(v, dict)}
            new_doc = _apply_update(base, update)
            await self._insert_raw(new_doc)
            return type("R", (), {"matched_count": 0, "modified_count": 1, "upserted_id": True})()
        return type("R", (), {"matched_count": 0, "modified_count": 0})()

    async def update_many(self, query: dict, update: dict):
        n = 0
        for pk, doc in await self._all():
            if _match_doc(doc, query or {}):
                await self._save(pk, _apply_update(doc, update))
                n += 1
        return type("R", (), {"matched_count": n, "modified_count": n})()

    async def delete_one(self, query: dict):
        pool = await init_pool()
        for pk, doc in await self._all():
            if _match_doc(doc, query or {}):
                async with pool.acquire() as conn:
                    await conn.execute("DELETE FROM documents WHERE pk = $1::uuid", pk)
                return type("R", (), {"deleted_count": 1})()
        return type("R", (), {"deleted_count": 0})()

    async def delete_many(self, query: dict):
        pool = await init_pool()
        n = 0
        for pk, doc in await self._all():
            if _match_doc(doc, query or {}):
                async with pool.acquire() as conn:
                    await conn.execute("DELETE FROM documents WHERE pk = $1::uuid", pk)
                n += 1
        return type("R", (), {"deleted_count": n})()

    async def count_documents(self, query: Optional[dict] = None) -> int:
        q = query or {}
        return sum(1 for _pk, doc in await self._all() if _match_doc(doc, q))


class _LazyCursor:
    """Cursor that loads matching docs on first materialization."""

    def __init__(self, coll: Collection, query: dict, projection: Optional[dict]):
        self._coll = coll
        self._query = query
        self._projection = projection
        self._docs: Optional[list[dict]] = None
        self._sort: Optional[tuple[str, int]] = None
        self._skip: int = 0
        self._limit: Optional[int] = None
        self._i = 0

    def sort(self, key: str, direction: int = 1):
        self._sort = (key, direction)
        return self

    def skip(self, n: int):
        self._skip = max(0, int(n or 0))
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    async def _materialize(self) -> list[dict]:
        if self._docs is not None:
            return self._docs
        docs = []
        for _pk, doc in await self._coll._all():
            if _match_doc(doc, self._query):
                docs.append(_apply_projection(doc, self._projection))
        if self._sort:
            field, direction = self._sort
            docs.sort(key=lambda d: _sort_key(d, field), reverse=direction < 0)
        if self._skip:
            docs = docs[self._skip:]
        if self._limit is not None:
            docs = docs[: self._limit]
        self._docs = docs
        return docs

    async def to_list(self, length: Optional[int] = None) -> list[dict]:
        docs = await self._materialize()
        if length is None:
            return list(docs)
        return list(docs[:length])

    def __aiter__(self):
        return self

    async def __anext__(self) -> dict:
        docs = await self._materialize()
        if self._i >= len(docs):
            raise StopAsyncIteration
        doc = docs[self._i]
        self._i += 1
        return doc


class Database:
    def __getattr__(self, name: str) -> Collection:
        if name.startswith("_"):
            raise AttributeError(name)
        return Collection(name)


db = Database()
