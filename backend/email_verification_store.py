"""PostgreSQL-backed EmailVerification records for pre-account OTP flows."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from pg_store import get_pool

PURPOSE_SIGNUP = "signup"
PURPOSE_PASSWORD_RESET = "password_reset"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _window_start(now: datetime, window_seconds: int = 3600) -> datetime:
    ts = int(now.timestamp())
    bucket = (ts // window_seconds) * window_seconds
    return datetime.fromtimestamp(bucket, tz=timezone.utc)


@dataclass
class EmailVerificationRow:
    id: str
    email: str
    purpose: str
    otp_hash: str
    attempts: int
    max_attempts: int
    send_count: int
    expires_at: datetime
    consumed_at: Optional[datetime]
    last_sent_at: datetime
    created_at: datetime
    token_jti: Optional[str]
    token_consumed_at: Optional[datetime]

    @classmethod
    def from_record(cls, row) -> "EmailVerificationRow":
        return cls(
            id=str(row["id"]),
            email=row["email"],
            purpose=row["purpose"],
            otp_hash=row["otp_hash"],
            attempts=row["attempts"],
            max_attempts=row["max_attempts"],
            send_count=row["send_count"],
            expires_at=row["expires_at"],
            consumed_at=row["consumed_at"],
            last_sent_at=row["last_sent_at"],
            created_at=row["created_at"],
            token_jti=str(row["token_jti"]) if row["token_jti"] else None,
            token_consumed_at=row["token_consumed_at"],
        )


async def invalidate_active(email: str, purpose: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE email_verifications
            SET consumed_at = NOW()
            WHERE email = $1
              AND purpose = $2
              AND consumed_at IS NULL
              AND expires_at > NOW()
            """,
            email,
            purpose,
        )


async def create_signup_verification(
    *,
    email: str,
    otp_hash: str,
    expires_at: datetime,
    max_attempts: int,
) -> EmailVerificationRow:
    await invalidate_active(email, PURPOSE_SIGNUP)
    pool = await get_pool()
    vid = str(uuid.uuid4())
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO email_verifications (
                id, email, purpose, otp_hash, max_attempts, expires_at
            ) VALUES ($1::uuid, $2, $3, $4, $5, $6)
            RETURNING *
            """,
            vid,
            email,
            PURPOSE_SIGNUP,
            otp_hash,
            max_attempts,
            expires_at,
        )
    return EmailVerificationRow.from_record(row)


async def get_active_signup_verification(email: str) -> Optional[EmailVerificationRow]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT * FROM email_verifications
            WHERE email = $1
              AND purpose = $2
              AND consumed_at IS NULL
              AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
            """,
            email,
            PURPOSE_SIGNUP,
        )
    return EmailVerificationRow.from_record(row) if row else None


async def get_last_sent_at(email: str, purpose: str) -> Optional[datetime]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            """
            SELECT last_sent_at FROM email_verifications
            WHERE email = $1 AND purpose = $2
            ORDER BY last_sent_at DESC
            LIMIT 1
            """,
            email,
            purpose,
        )


async def count_sends_since(email: str, purpose: str, since: datetime) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            """
            SELECT COUNT(*)::int FROM email_verifications
            WHERE email = $1
              AND purpose = $2
              AND created_at >= $3
            """,
            email,
            purpose,
            since,
        )


async def increment_attempts(verification_id: str) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            """
            UPDATE email_verifications
            SET attempts = attempts + 1
            WHERE id = $1::uuid
            RETURNING attempts
            """,
            verification_id,
        )


async def mark_otp_consumed(verification_id: str, token_jti: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE email_verifications
            SET consumed_at = NOW(),
                token_jti = $2::uuid
            WHERE id = $1::uuid
            """,
            verification_id,
            token_jti,
        )


async def get_verification_by_id(verification_id: str) -> Optional[EmailVerificationRow]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM email_verifications WHERE id = $1::uuid",
            verification_id,
        )
    return EmailVerificationRow.from_record(row) if row else None


async def mark_signup_token_consumed(verification_id: str, token_jti: str) -> bool:
    """Mark a signup verification JWT as used (Phase 2 register). Returns False if already consumed."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        status = await conn.fetchval(
            """
            UPDATE email_verifications
            SET token_consumed_at = NOW()
            WHERE id = $1::uuid
              AND purpose = $2
              AND token_jti = $3::uuid
              AND token_consumed_at IS NULL
              AND consumed_at IS NOT NULL
            RETURNING id
            """,
            verification_id,
            PURPOSE_SIGNUP,
            token_jti,
        )
    return status is not None


async def bump_rate_limit(bucket_key: str, *, window_seconds: int = 3600) -> int:
    """Increment a fixed-window counter; returns the new count."""
    now = _utcnow()
    window = _window_start(now, window_seconds)
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            """
            INSERT INTO auth_rate_limits (bucket_key, window_start, count)
            VALUES ($1, $2, 1)
            ON CONFLICT (bucket_key, window_start)
            DO UPDATE SET count = auth_rate_limits.count + 1
            RETURNING count
            """,
            bucket_key,
            window,
        )


async def cleanup_stale_rate_limits(older_than_hours: int = 48) -> None:
    cutoff = _utcnow() - timedelta(hours=older_than_hours)
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM auth_rate_limits WHERE window_start < $1",
            cutoff,
        )
