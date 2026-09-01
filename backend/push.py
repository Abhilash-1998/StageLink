"""
Backward-compatible push helpers.

New code should prefer:
    from services.notifications import NotificationService, register_push_device, ...
"""
from __future__ import annotations

from typing import Any, Optional

from services.notifications import (
    NotificationService,
    register_push_device,
    unregister_push_device,
    _deliver_push,
)


async def register_device(user_id: str, token: str, platform: Optional[str] = None,
                          device_name: Optional[str] = None) -> dict:
    return await register_push_device(user_id, token, platform, device_name)


async def unregister_device(user_id: str, token: str) -> None:
    await unregister_push_device(user_id, token)


async def send_push(
    user_id: str,
    title: str,
    body: str,
    data: Optional[dict[str, Any]] = None,
) -> int:
    return await _deliver_push(user_id, title, body, data)


def schedule_push(user_id: str, title: str, body: str, data: Optional[dict] = None) -> None:
    """Legacy — routes through NotificationService (inbox + push)."""
    ntype = "system.generic"
    deep = None
    meta = dict(data or {})
    t = (data or {}).get("type")
    if t == "message":
        ntype = "messages.new"
        uid = (data or {}).get("from_user_id")
        deep = f"/chat/{uid}" if uid else None
    elif t == "follow":
        ntype = "social.follow"
        uid = (data or {}).get("from_user_id")
        deep = f"/user/{uid}" if uid else None
    elif t in ("application", "gig"):
        ntype = "gigs.application" if t == "application" else "gigs.cancelled"
        gid = (data or {}).get("gig_id")
        deep = f"/gig/{gid}" if gid else None
    NotificationService.schedule(
        user_id, ntype, title, body, deep_link=deep, meta=meta,
    )
