"""
gigZee NotificationService — production Expo Push + in-app inbox.

Collections (Postgres JSONB document store):
  - push_devices
  - notifications
  - notification_prefs
  - device_tokens (legacy mirror)

Usage:
    NotificationService.schedule(recipient_id, "gigs.application", title, body, deep_link=...)
    await NotificationService.send(...)
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import requests

from pg_store import db

log = logging.getLogger("gigze.notifications")

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
MAX_PUSH_RETRIES = 3
DEFAULT_PUSH_RICH_IMAGE = (os.getenv("GIGZE_PUSH_RICH_IMAGE_URL") or "").strip()

TYPE_CATEGORY: dict[str, str] = {
    "messages.new": "messages",
    "social.follow": "social",
    "social.post_liked": "social",
    "social.comment": "social",
    "social.reply": "social",
    "social.mention": "social",
    "gigs.application": "gigs",
    "gigs.application_accepted": "gigs",
    "gigs.application_rejected": "gigs",
    "gigs.cancelled": "gigs",
    "gigs.updated": "gigs",
    "gigs.reminder": "gigs",
    "bands.invitation": "bands",
    "bands.join_approved": "bands",
    "bands.join_rejected": "bands",
    "equipment.rental_request": "equipment",
    "equipment.rental_approved": "equipment",
    "equipment.rental_completed": "equipment",
    "studios.booking_request": "studios",
    "studios.booking_confirmed": "studios",
    "studios.booking_reminder": "studios",
    "lessons.enrolled": "lessons",
    "lessons.upcoming": "lessons",
    "community.post": "community",
    "community.announcement": "community",
    "system.verification_approved": "system",
    "system.verification_rejected": "system",
    "system.admin_announcement": "system",
    "system.premium_activated": "system",
    "system.generic": "system",
    "system.test": "system",
}

DEFAULT_PREFS: dict[str, bool] = {
    "messages": True,
    "social": True,
    "community": True,
    "gigs": True,
    "bands": True,
    "equipment": True,
    "studios": True,
    "lessons": True,
    "promotions": False,
    "system": True,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def category_for(notif_type: str) -> str:
    return TYPE_CATEGORY.get(notif_type, "system")


async def get_prefs(user_id: str) -> dict[str, bool]:
    row = await db.notification_prefs.find_one({"user_id": user_id}, {"_id": 0})
    prefs = dict(DEFAULT_PREFS)
    if row and isinstance(row.get("prefs"), dict):
        for k, v in row["prefs"].items():
            if k in prefs:
                prefs[k] = bool(v)
    return prefs


async def set_prefs(user_id: str, updates: dict[str, bool]) -> dict[str, bool]:
    prefs = await get_prefs(user_id)
    for k, v in (updates or {}).items():
        if k in DEFAULT_PREFS:
            prefs[k] = bool(v)
    existing = await db.notification_prefs.find_one({"user_id": user_id})
    doc = {"user_id": user_id, "prefs": prefs, "updated_at": _now()}
    if existing:
        await db.notification_prefs.update_one({"user_id": user_id}, {"$set": doc})
    else:
        doc["created_at"] = _now()
        await db.notification_prefs.insert_one(doc)
    return prefs


async def register_push_device(
    user_id: str,
    expo_push_token: str,
    platform: Optional[str] = None,
    device_name: Optional[str] = None,
) -> dict:
    token = (expo_push_token or "").strip()
    if not token:
        raise ValueError("expo_push_token required")
    if not (token.startswith("ExponentPushToken[") or token.startswith("ExpoPushToken[")):
        # Still allow — Expo formats vary; warn only
        log.warning("Unusual Expo push token format for user=%s", user_id)

    existing = await db.push_devices.find_one({"expo_push_token": token}, {"_id": 0})
    now = _now()
    if existing:
        # If token moved to another user, reassign
        did = existing.get("id") or str(uuid.uuid4())
        doc = {
            "id": did,
            "user_id": user_id,
            "expo_push_token": token,
            "platform": platform or existing.get("platform") or "unknown",
            "device_name": device_name or existing.get("device_name"),
            "is_active": True,
            "updated_at": now,
            "created_at": existing.get("created_at") or now,
        }
        await db.push_devices.update_one({"expo_push_token": token}, {"$set": doc})
    else:
        # Deactivate other active tokens for same platform+device_name? Keep all devices.
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "expo_push_token": token,
            "platform": platform or "unknown",
            "device_name": device_name,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        await db.push_devices.insert_one(doc)

    leg = await db.device_tokens.find_one({"token": token}, {"_id": 0})
    leg_doc = {
        "token": token, "user_id": user_id, "platform": platform or "unknown",
        "device_name": device_name, "updated_at": now,
    }
    if leg:
        await db.device_tokens.update_one({"token": token}, {"$set": leg_doc})
    else:
        leg_doc["created_at"] = now
        await db.device_tokens.insert_one(leg_doc)

    doc.pop("_id", None)
    return doc


async def unregister_push_device(user_id: str, expo_push_token: str) -> None:
    token = (expo_push_token or "").strip()
    await db.push_devices.update_one(
        {"expo_push_token": token, "user_id": user_id},
        {"$set": {"is_active": False, "updated_at": _now()}},
    )
    await db.device_tokens.delete_one({"token": token, "user_id": user_id})


async def _active_tokens(user_id: str) -> list[str]:
    rows = await db.push_devices.find(
        {"user_id": user_id, "is_active": True},
        {"_id": 0, "expo_push_token": 1},
    ).to_list(50)
    tokens = [r["expo_push_token"] for r in rows if r.get("expo_push_token")]
    if tokens:
        return list(dict.fromkeys(tokens))
    legacy = await db.device_tokens.find({"user_id": user_id}, {"_id": 0, "token": 1}).to_list(50)
    return list(dict.fromkeys([r["token"] for r in legacy if r.get("token")]))


async def list_push_devices(user_id: str) -> list[dict]:
    rows = await db.push_devices.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    rows.sort(key=lambda r: r.get("updated_at") or r.get("created_at") or "", reverse=True)
    return rows


def _post_expo(messages: list[dict]) -> tuple[list[str], list[dict], list[dict]]:
    """Returns (dead_tokens, retry_messages, tickets)."""
    dead: list[str] = []
    retry: list[dict] = []
    tickets: list[dict] = []
    if not messages:
        return dead, retry, tickets
    try:
        res = requests.post(
            EXPO_PUSH_URL,
            json=messages,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Accept-Encoding": "gzip, deflate",
            },
            timeout=15,
        )
        if res.status_code >= 500:
            return dead, messages, [{"status": "error", "message": f"HTTP {res.status_code}"}]
        if res.status_code >= 400:
            log.warning("Expo push HTTP %s: %s", res.status_code, res.text[:300])
            return dead, [], [{"status": "error", "message": res.text[:300]}]
        body = res.json() if res.content else {}
        data = body.get("data") or []
        if isinstance(data, dict):
            data = [data]
        for i, item in enumerate(data):
            tickets.append(item if isinstance(item, dict) else {"status": "error", "message": str(item)})
            if not isinstance(item, dict) or item.get("status") == "ok":
                continue
            details = item.get("details") or {}
            err = details.get("error") or item.get("message") or ""
            tok = messages[i].get("to") if i < len(messages) else None
            if err in ("DeviceNotRegistered", "InvalidCredentials"):
                if tok:
                    dead.append(tok)
            else:
                if i < len(messages):
                    retry.append(messages[i])
            log.warning("Expo push error: %s", item)
    except Exception as e:
        log.exception("Expo push failed")
        return dead, messages, [{"status": "error", "message": str(e)}]
    return dead, retry, tickets


def _fetch_push_receipts(ticket_ids: list[str]) -> dict:
    ids = [t for t in ticket_ids if t]
    if not ids:
        return {}
    try:
        res = requests.post(
            "https://exp.host/--/api/v2/push/getReceipts",
            json={"ids": ids},
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        if res.status_code >= 400:
            return {"_http_error": res.text[:300]}
        body = res.json() if res.content else {}
        return body.get("data") or {}
    except Exception as e:
        return {"_exception": str(e)}


async def deliver_push_detailed(
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict[str, Any]] = None,
) -> dict:
    """Send push and return diagnostics (tokens, tickets, receipts)."""
    tokens = await _active_tokens(user_id)
    if not tokens:
        return {
            "sent": 0,
            "tokens": [],
            "tickets": [],
            "receipts": {},
            "error": "No active Expo push tokens registered for this user.",
            "hint": "Open the app on a physical device / dev build, allow notifications, then retry.",
        }

    rich_image = (data or {}).get("image_url") or DEFAULT_PUSH_RICH_IMAGE
    messages = []
    for t in tokens:
        msg = {
            "to": t,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
            "priority": "high",
            "channelId": "default",
            "_contentAvailable": True,
            # Explicit Android fields improve delivery when the app is backgrounded/killed.
            "android": {
                "channelId": "default",
                "priority": "high",
            },
        }
        # Where supported by the OS/vendor, this renders a branded large image.
        if isinstance(rich_image, str) and rich_image.strip():
            msg["richContent"] = {"image": rich_image.strip()}
        messages.append(msg)
    remaining = messages
    all_tickets: list[dict] = []
    for attempt in range(MAX_PUSH_RETRIES):
        dead, retry, tickets = await asyncio.to_thread(_post_expo, remaining)
        all_tickets.extend(tickets)
        for tok in dead:
            await db.push_devices.update_one(
                {"expo_push_token": tok},
                {"$set": {"is_active": False, "updated_at": _now()}},
            )
            await db.device_tokens.delete_many({"token": tok})
        if not retry:
            break
        remaining = retry
        await asyncio.sleep(0.4 * (attempt + 1))

    ticket_ids = [t.get("id") for t in all_tickets if isinstance(t, dict) and t.get("id")]
    receipts = {}
    if ticket_ids:
        # Receipts are eventually consistent — brief wait helps local debugging.
        await asyncio.sleep(1.2)
        receipts = await asyncio.to_thread(_fetch_push_receipts, ticket_ids)

    ok_tickets = sum(1 for t in all_tickets if isinstance(t, dict) and t.get("status") == "ok")
    return {
        "sent": ok_tickets,
        "tokens": tokens,
        "tickets": all_tickets,
        "receipts": receipts,
        "error": None if ok_tickets else "Expo did not accept any push tickets.",
    }


async def _deliver_push(
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict[str, Any]] = None,
) -> int:
    result = await deliver_push_detailed(user_id, title, body, data)
    return int(result.get("sent") or 0)


async def save_inbox(
    recipient_id: str,
    notif_type: str,
    title: str,
    body: str,
    deep_link: Optional[str] = None,
    image_url: Optional[str] = None,
    sender_id: Optional[str] = None,
    meta: Optional[dict] = None,
) -> dict:
    """Insert a notification, or upsert+group for direct-message threads."""
    if notif_type == "messages.new" and sender_id:
        return await upsert_message_inbox(
            recipient_id=recipient_id,
            title=title,
            body=body,
            deep_link=deep_link,
            image_url=image_url,
            sender_id=sender_id,
            meta=meta,
        )

    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "recipient_id": recipient_id,
        "sender_id": sender_id,
        "type": notif_type,
        "title": title,
        "body": body,
        "image_url": image_url,
        "deep_link": deep_link,
        "is_read": False,
        "unread_count": 1,
        "meta": meta or {},
        "created_at": now,
        "updated_at": now,
    }
    await db.notifications.insert_one(doc)
    doc.pop("_id", None)
    return doc


def _conversation_id(recipient_id: str, sender_id: str) -> str:
    a, b = sorted([recipient_id, sender_id])
    return f"{a}::{b}"


async def upsert_message_inbox(
    *,
    recipient_id: str,
    title: str,
    body: str,
    deep_link: Optional[str],
    image_url: Optional[str],
    sender_id: str,
    meta: Optional[dict],
) -> dict:
    """One inbox card per DM conversation — WhatsApp-style grouping."""
    now = _now()
    conv_id = _conversation_id(recipient_id, sender_id)
    existing_rows = await db.notifications.find(
        {
            "recipient_id": recipient_id,
            "type": "messages.new",
            "sender_id": sender_id,
        },
        {"_id": 0},
    ).sort("created_at", -1).to_list(50)

    # Prefer an unread card; otherwise the most recently updated one.
    existing = None
    for r in existing_rows:
        if not r.get("is_read"):
            existing = r
            break
    if existing is None and existing_rows:
        existing = existing_rows[0]

    base_meta = dict(meta or {})
    base_meta.update({
        "conversation_id": conv_id,
        "sender_id": sender_id,
        "sender_name": title,
        "latest_message": body,
    })

    if existing:
        prev_count = int(existing.get("unread_count") or 0)
        if existing.get("is_read"):
            new_count = 1
        else:
            new_count = max(1, prev_count) + 1

        patch = {
            "title": title,
            "body": body,
            "image_url": image_url or existing.get("image_url"),
            "deep_link": deep_link or existing.get("deep_link") or f"/chat/{sender_id}",
            "is_read": False,
            "unread_count": new_count,
            "meta": {**(existing.get("meta") or {}), **base_meta, "latest_timestamp": now},
            "updated_at": now,
            # Bump created_at so legacy sort("created_at") still surfaces newest chats.
            "created_at": now,
        }
        await db.notifications.update_one({"id": existing["id"]}, {"$set": patch})

        # Collapse historical duplicates for this conversation.
        for r in existing_rows:
            if r.get("id") and r["id"] != existing["id"]:
                await db.notifications.delete_one({"id": r["id"]})

        out = {**existing, **patch, "id": existing["id"], "recipient_id": recipient_id,
               "sender_id": sender_id, "type": "messages.new"}
        out.pop("_id", None)
        return out

    doc = {
        "id": str(uuid.uuid4()),
        "recipient_id": recipient_id,
        "sender_id": sender_id,
        "type": "messages.new",
        "title": title,
        "body": body,
        "image_url": image_url,
        "deep_link": deep_link or f"/chat/{sender_id}",
        "is_read": False,
        "unread_count": 1,
        "meta": {**base_meta, "latest_timestamp": now},
        "created_at": now,
        "updated_at": now,
    }
    await db.notifications.insert_one(doc)
    doc.pop("_id", None)
    return doc


def _sort_key(row: dict) -> str:
    return row.get("updated_at") or row.get("created_at") or ""


def _collapse_message_rows(rows: list[dict]) -> list[dict]:
    """Safety net: collapse any leftover per-message DM rows by sender."""
    out: list[dict] = []
    msg_by_sender: dict[str, dict] = {}
    for r in rows:
        if r.get("type") != "messages.new" or not r.get("sender_id"):
            out.append(r)
            continue
        sid = r["sender_id"]
        prev = msg_by_sender.get(sid)
        if not prev:
            # Normalize fields for the client
            count = int(r.get("unread_count") or (0 if r.get("is_read") else 1))
            r = {
                **r,
                "unread_count": count,
                "updated_at": r.get("updated_at") or r.get("created_at"),
            }
            msg_by_sender[sid] = r
            out.append(r)
            continue
        # Merge into the newer card (rows arrive newest-first usually).
        newer_first = _sort_key(r) >= _sort_key(prev)
        keep, drop = (r, prev) if newer_first else (prev, r)
        merged_count = int(keep.get("unread_count") or 0) + int(drop.get("unread_count") or 0)
        if not keep.get("is_read") and not drop.get("is_read"):
            # If both unread and counts were missing (legacy=1 each), sum works.
            if not keep.get("unread_count") and not drop.get("unread_count"):
                merged_count = 2
        elif keep.get("is_read") and not drop.get("is_read"):
            merged_count = int(drop.get("unread_count") or 1)
            keep["is_read"] = False
        keep["unread_count"] = max(1, merged_count) if not keep.get("is_read") else int(keep.get("unread_count") or 0)
        keep["updated_at"] = max(_sort_key(keep), _sort_key(drop))
        if newer_first:
            keep["body"] = r.get("body") or keep.get("body")
            keep["title"] = r.get("title") or keep.get("title")
            keep["image_url"] = r.get("image_url") or keep.get("image_url")
            keep["created_at"] = r.get("created_at") or keep.get("created_at")
        # Replace prev in out
        for i, item in enumerate(out):
            if item is prev or item.get("id") == prev.get("id"):
                out[i] = keep
                break
        msg_by_sender[sid] = keep
    out.sort(key=_sort_key, reverse=True)
    return out


async def list_inbox(
    user_id: str,
    *,
    limit: int = 30,
    offset: int = 0,
    unread_only: bool = False,
) -> dict:
    q: dict[str, Any] = {"recipient_id": user_id}
    if unread_only:
        q["is_read"] = False
    rows = await db.notifications.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)
    rows = _collapse_message_rows(rows)
    if unread_only:
        rows = [r for r in rows if not r.get("is_read")]
    total = len(rows)
    unread = _aggregate_unread(rows)
    page = rows[offset: offset + limit]
    return {
        "items": page,
        "total": total,
        "unread": unread,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(page) < total,
    }


def _aggregate_unread(rows: list[dict]) -> int:
    """Inbox badge: sum DM unread message counts + 1 per other unread notif."""
    total = 0
    for r in rows:
        if r.get("is_read"):
            continue
        if r.get("type") == "messages.new":
            total += max(1, int(r.get("unread_count") or 1))
        else:
            total += 1
    return total


async def mark_read(user_id: str, notif_id: str) -> bool:
    n = await db.notifications.find_one({"id": notif_id, "recipient_id": user_id})
    if not n:
        return False
    await db.notifications.update_one(
        {"id": notif_id},
        {"$set": {
            "is_read": True,
            "unread_count": 0,
            "read_at": _now(),
            "updated_at": _now(),
        }},
    )
    # If this is a DM card, also clear any leftover duplicates for that sender.
    if n.get("type") == "messages.new" and n.get("sender_id"):
        extras = await db.notifications.find(
            {
                "recipient_id": user_id,
                "type": "messages.new",
                "sender_id": n["sender_id"],
                "id": {"$ne": notif_id},
            },
            {"_id": 0, "id": 1},
        ).to_list(50)
        for e in extras:
            await db.notifications.update_one(
                {"id": e["id"]},
                {"$set": {"is_read": True, "unread_count": 0, "read_at": _now()}},
            )
    return True


async def mark_all_read(user_id: str) -> int:
    rows = await db.notifications.find(
        {"recipient_id": user_id, "is_read": False}, {"_id": 0, "id": 1}
    ).to_list(5000)
    now = _now()
    for r in rows:
        await db.notifications.update_one(
            {"id": r["id"]},
            {"$set": {"is_read": True, "unread_count": 0, "read_at": now, "updated_at": now}},
        )
    return len(rows)


async def delete_notification(user_id: str, notif_id: str) -> bool:
    n = await db.notifications.find_one({"id": notif_id, "recipient_id": user_id})
    if not n:
        return False
    await db.notifications.delete_one({"id": notif_id})
    # Delete sibling DM cards for the same conversation if any remain.
    if n.get("type") == "messages.new" and n.get("sender_id"):
        siblings = await db.notifications.find(
            {
                "recipient_id": user_id,
                "type": "messages.new",
                "sender_id": n["sender_id"],
            },
            {"_id": 0, "id": 1},
        ).to_list(50)
        for s in siblings:
            await db.notifications.delete_one({"id": s["id"]})
    return True


async def unread_count(user_id: str) -> int:
    rows = await db.notifications.find(
        {"recipient_id": user_id, "is_read": False}, {"_id": 0}
    ).to_list(5000)
    return _aggregate_unread(_collapse_message_rows(rows))


class NotificationService:
    """Single facade used by every product module."""

    @staticmethod
    async def send(
        recipient_id: str,
        type: str,
        title: str,
        body: str,
        deep_link: Optional[str] = None,
        image_url: Optional[str] = None,
        sender_id: Optional[str] = None,
        meta: Optional[dict] = None,
        *,
        push: bool = True,
        inbox: bool = True,
    ) -> Optional[dict]:
        if not recipient_id:
            return None
        if sender_id and sender_id == recipient_id:
            return None

        # Category prefs are unused: every notification type may be sent.


        saved = None
        if inbox:
            try:
                saved = await save_inbox(
                    recipient_id, type, title, body, deep_link, image_url, sender_id, meta,
                )
            except Exception:
                log.exception("Failed to save inbox notification")

        if push:
            data: dict[str, Any] = {
                **(meta or {}),
                "type": type,
                "path": deep_link or "",
                "notification_id": (saved or {}).get("id"),
                "unread_count": (saved or {}).get("unread_count") or 1,
            }
            if image_url:
                data.setdefault("image_url", image_url)
            if deep_link and deep_link.startswith("/gig/"):
                data.setdefault("gig_id", deep_link.split("/gig/")[-1].split("?")[0])
            if deep_link and deep_link.startswith("/chat/"):
                data.setdefault("from_user_id", deep_link.split("/chat/")[-1].split("?")[0])
            if deep_link and deep_link.startswith("/user/"):
                data.setdefault("from_user_id", deep_link.split("/user/")[-1].split("/")[0].split("?")[0])
            try:
                await _deliver_push(recipient_id, title, body, data)
            except Exception:
                log.exception("Push delivery failed for %s", recipient_id)

        return saved

    @staticmethod
    def schedule(
        recipient_id: str,
        type: str,
        title: str,
        body: str,
        deep_link: Optional[str] = None,
        image_url: Optional[str] = None,
        sender_id: Optional[str] = None,
        meta: Optional[dict] = None,
        *,
        push: bool = True,
        inbox: bool = True,
    ) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(
                NotificationService.send(
                    recipient_id, type, title, body, deep_link, image_url, sender_id, meta,
                    push=push, inbox=inbox,
                )
            )
        except RuntimeError:
            log.debug("No event loop; skip notification to %s", recipient_id)

    @staticmethod
    def schedule_many(
        recipient_ids: list[str],
        type: str,
        title: str,
        body: str,
        deep_link: Optional[str] = None,
        image_url: Optional[str] = None,
        sender_id: Optional[str] = None,
        meta: Optional[dict] = None,
    ) -> None:
        for rid in dict.fromkeys([r for r in recipient_ids if r]):
            NotificationService.schedule(
                rid, type, title, body, deep_link, image_url, sender_id, meta,
            )

    # ── Typed helpers (call from features; safe if product surface missing) ─

    @staticmethod
    def new_message(to_id: str, from_user: dict, preview: str) -> None:
        sid = from_user.get("id")
        NotificationService.schedule(
            to_id, "messages.new",
            from_user.get("full_name") or "New message", preview,
            deep_link=f"/chat/{sid}",
            sender_id=sid,
            image_url=from_user.get("avatar_url"),
            meta={
                "conversation_id": f"{'::'.join(sorted([to_id, sid]))}" if sid else None,
                "sender_id": sid,
                "sender_name": from_user.get("full_name"),
                "latest_message": preview,
            },
        )

    @staticmethod
    def new_follower(target_id: str, follower: dict) -> None:
        NotificationService.schedule(
            target_id, "social.follow", "New follower",
            f"{follower.get('full_name') or 'Someone'} started following you",
            deep_link=f"/user/{follower.get('id')}",
            sender_id=follower.get("id"),
            image_url=follower.get("avatar_url"),
        )

    @staticmethod
    def post_liked(author_id: str, actor: dict, post_id: str) -> None:
        NotificationService.schedule(
            author_id, "social.post_liked", "New like",
            f"{actor.get('full_name') or 'Someone'} liked your post",
            deep_link=f"/user/{author_id}/posts",
            sender_id=actor.get("id"),
            image_url=actor.get("avatar_url"),
            meta={"post_id": post_id},
        )

    @staticmethod
    def post_commented(author_id: str, actor: dict, post_id: str, preview: str) -> None:
        NotificationService.schedule(
            author_id, "social.comment", "New comment",
            f"{actor.get('full_name') or 'Someone'}: {preview}",
            deep_link=f"/user/{author_id}/posts",
            sender_id=actor.get("id"),
            image_url=actor.get("avatar_url"),
            meta={"post_id": post_id},
        )

    @staticmethod
    def comment_reply(parent_author_id: str, actor: dict, post_id: str, preview: str) -> None:
        NotificationService.schedule(
            parent_author_id, "social.reply", "New reply",
            f"{actor.get('full_name') or 'Someone'} replied: {preview}",
            deep_link=f"/user/{parent_author_id}/posts",
            sender_id=actor.get("id"),
            image_url=actor.get("avatar_url"),
            meta={"post_id": post_id},
        )

    @staticmethod
    def mention(mentioned_id: str, actor: dict, preview: str, deep_link: str) -> None:
        NotificationService.schedule(
            mentioned_id, "social.mention", "You were mentioned",
            f"{actor.get('full_name') or 'Someone'}: {preview}",
            deep_link=deep_link,
            sender_id=actor.get("id"),
            image_url=actor.get("avatar_url"),
        )

    @staticmethod
    def gig_application(organizer_id: str, actor: dict, gig: dict) -> None:
        gid = gig.get("id")
        NotificationService.schedule(
            organizer_id, "gigs.application", "New collaboration request",
            f"{actor.get('full_name') or 'Someone'} wants to collaborate on {gig.get('title') or 'your gig'}",
            deep_link=f"/gig/{gid}",
            sender_id=actor.get("id"),
            meta={"gig_id": gid},
        )

    @staticmethod
    def gig_accepted(musician_id: str, actor: dict, gig: dict) -> None:
        gid = gig.get("id")
        NotificationService.schedule(
            musician_id, "gigs.application_accepted", "You're in!",
            f"You were accepted for {gig.get('title') or 'a gig'}",
            deep_link=f"/gig/{gid}",
            sender_id=actor.get("id"),
            meta={"gig_id": gid},
        )

    @staticmethod
    def gig_rejected(musician_id: str, actor: dict, gig: dict) -> None:
        gid = gig.get("id")
        NotificationService.schedule(
            musician_id, "gigs.application_rejected", "Update on your request",
            f"Your request for {gig.get('title') or 'a gig'} wasn't selected",
            deep_link=f"/gig/{gid}",
            sender_id=actor.get("id"),
            meta={"gig_id": gid},
        )

    @staticmethod
    def gig_cancelled(musician_id: str, actor: dict, gig: dict) -> None:
        gid = gig.get("id")
        NotificationService.schedule(
            musician_id, "gigs.cancelled", "Gig cancelled",
            f"{gig.get('title') or 'A gig'} was cancelled",
            deep_link=f"/gig/{gid}",
            sender_id=actor.get("id"),
            meta={"gig_id": gid},
        )

    # Future-ready helpers (safe to call when those products ship)
    @staticmethod
    def band_invitation(to_id: str, actor: dict, band: dict) -> None:
        NotificationService.schedule(
            to_id, "bands.invitation", "Band invitation",
            f"{actor.get('full_name') or 'Someone'} invited you to {band.get('name') or 'a band'}",
            deep_link=f"/listing/band/{band.get('id')}",
            sender_id=actor.get("id"),
            meta={"band_id": band.get("id")},
        )

    @staticmethod
    def equipment_rental_request(owner_id: str, actor: dict, item: dict) -> None:
        NotificationService.schedule(
            owner_id, "equipment.rental_request", "Rental request",
            f"{actor.get('full_name') or 'Someone'} requested {item.get('title') or 'your gear'}",
            deep_link=f"/listing/equipment/{item.get('id')}",
            sender_id=actor.get("id"),
            meta={"equipment_id": item.get("id")},
        )

    @staticmethod
    def studio_booking(owner_id: str, actor: dict, studio: dict, ntype: str = "studios.booking_request") -> None:
        NotificationService.schedule(
            owner_id, ntype, "Studio booking",
            f"{actor.get('full_name') or 'Someone'} — {studio.get('name') or 'studio'} update",
            deep_link=f"/listing/studio/{studio.get('id')}",
            sender_id=actor.get("id"),
            meta={"studio_id": studio.get("id")},
        )

    @staticmethod
    def lesson_reminder(student_id: str, lesson: dict) -> None:
        NotificationService.schedule(
            student_id, "lessons.upcoming", "Upcoming lesson",
            f"Reminder: {lesson.get('title') or 'your lesson'} is coming up",
            deep_link=f"/listing/lesson/{lesson.get('id')}",
            meta={"lesson_id": lesson.get("id")},
        )

    @staticmethod
    def verification(user_id: str, approved: bool) -> None:
        if approved:
            NotificationService.schedule(
                user_id, "system.verification_approved", "Verified!",
                "Your gigZee verification was approved.",
                deep_link="/(tabs)/profile",
            )
        else:
            NotificationService.schedule(
                user_id, "system.verification_rejected", "Verification update",
                "Your verification request needs changes.",
                deep_link="/(tabs)/profile",
            )

    @staticmethod
    def system_announcement(user_ids: list[str], title: str, body: str, deep_link: str = "/notifications") -> None:
        NotificationService.schedule_many(
            user_ids, "system.admin_announcement", title, body, deep_link=deep_link,
        )

    @staticmethod
    def community_post(follower_ids: list[str], author: dict, post_id: str, preview: str) -> None:
        NotificationService.schedule_many(
            follower_ids, "community.post",
            f"{author.get('full_name') or 'Someone'} posted",
            preview,
            deep_link=f"/user/{author.get('id')}/posts",
            sender_id=author.get("id"),
            image_url=author.get("avatar_url"),
            meta={"post_id": post_id},
        )
