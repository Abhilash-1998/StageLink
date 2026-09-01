"""
gigZee AnalyticsService

Internal event tracking with pluggable sinks.
- Never blocks request handlers (schedule / BackgroundTasks)
- JSONB-style events in analytics_events collection
- Admin aggregate helpers for DAU/WAU/MAU and product metrics
- Future sinks: Firebase / Mixpanel / Amplitude / PostHog / GA

Usage:
    from services.analytics import AnalyticsService
    AnalyticsService.track(user_id, "message_sent", entity_type="message", entity_id=...)
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Protocol

from pg_store import db

log = logging.getLogger("gigze.analytics")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


class AnalyticsSink(Protocol):
    async def emit(self, event: dict) -> None: ...


class InternalSink:
    """Default sink — persist to Postgres JSONB document store."""

    async def emit(self, event: dict) -> None:
        await db.analytics_events.insert_one(event)


# Registry of sinks (swap/extend without changing call sites)
_SINKS: list[AnalyticsSink] = [InternalSink()]


def register_sink(sink: AnalyticsSink) -> None:
    _SINKS.append(sink)


async def _emit_all(event: dict) -> None:
    for sink in list(_SINKS):
        try:
            await sink.emit(event)
        except Exception:
            log.exception("Analytics sink failed: %s", type(sink).__name__)


class AnalyticsService:
    @staticmethod
    async def track(
        user_id: Optional[str],
        event_name: str,
        *,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        platform: Optional[str] = None,
        device: Optional[str] = None,
        app_version: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> dict:
        event = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "event_name": event_name,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "metadata": metadata or {},
            "platform": platform,
            "device": device,
            "app_version": app_version,
            "ip_address": ip_address,
            "created_at": _now_iso(),
        }
        await _emit_all(event)
        event.pop("_id", None)
        return event

    @staticmethod
    def schedule(
        user_id: Optional[str],
        event_name: str,
        *,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
        platform: Optional[str] = None,
        device: Optional[str] = None,
        app_version: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(
                AnalyticsService.track(
                    user_id, event_name,
                    entity_type=entity_type, entity_id=entity_id,
                    metadata=metadata, platform=platform, device=device,
                    app_version=app_version, ip_address=ip_address,
                )
            )
        except RuntimeError:
            log.debug("No event loop; skip analytics %s", event_name)


def _parse_ts(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


async def admin_overview(days: int = 30) -> dict:
    """Compute core admin metrics from analytics_events + core collections."""
    since = _now() - timedelta(days=max(1, days))
    events = await db.analytics_events.find({}, {"_id": 0}).to_list(20000)
    recent = []
    for e in events:
        ts = _parse_ts(e.get("created_at"))
        if ts and ts >= since:
            recent.append(e)

    def unique_users(evts, within_days: int) -> int:
        cutoff = _now() - timedelta(days=within_days)
        ids = set()
        for e in evts:
            ts = _parse_ts(e.get("created_at"))
            if ts and ts >= cutoff and e.get("user_id"):
                ids.add(e["user_id"])
        return len(ids)

    name_counts = Counter(e.get("event_name") for e in recent if e.get("event_name"))

    # Core collection counts (lifetime / window where we have created_at)
    async def count_since(coll_name: str, days_n: int) -> int:
        coll = getattr(db, coll_name)
        cutoff = (_now() - timedelta(days=days_n)).isoformat()
        docs = await coll.find({}, {"_id": 0, "created_at": 1}).to_list(10000)
        n = 0
        for d in docs:
            ts = d.get("created_at") or ""
            if ts >= cutoff:
                n += 1
        return n

    users = await db.users.find({}, {"_id": 0, "id": 1, "created_at": 1, "city": 1}).to_list(10000)
    new_users = 0
    cutoff = (_now() - timedelta(days=days)).isoformat()
    for u in users:
        if (u.get("created_at") or "") >= cutoff:
            new_users += 1

    musicians = await db.musicians.find({}, {"_id": 0, "city": 1, "instruments": 1, "skills": 1}).to_list(5000)
    city_c: Counter = Counter()
    inst_c: Counter = Counter()
    skill_c: Counter = Counter()
    for m in musicians:
        if m.get("city"):
            city_c[m["city"]] += 1
        for i in (m.get("instruments") or []):
            inst_c[i] += 1
        for s in (m.get("skills") or []):
            skill_c[s] += 1

    # Daily series for growth chart
    by_day: dict[str, int] = defaultdict(int)
    for e in recent:
        ts = _parse_ts(e.get("created_at"))
        if ts:
            by_day[ts.date().isoformat()] += 1
    growth = [{"date": d, "events": by_day[d]} for d in sorted(by_day.keys())]

    # Most active users by event count
    user_activity = Counter(e.get("user_id") for e in recent if e.get("user_id"))
    top_users = [{"user_id": uid, "events": c} for uid, c in user_activity.most_common(20)]

    # Search keywords from metadata
    keywords: Counter = Counter()
    for e in recent:
        if e.get("event_name") == "search":
            q = (e.get("metadata") or {}).get("q") or (e.get("metadata") or {}).get("query")
            if q:
                keywords[str(q).strip().lower()] += 1

    return {
        "window_days": days,
        "dau": unique_users(events, 1),
        "wau": unique_users(events, 7),
        "mau": unique_users(events, 30),
        "new_users": new_users,
        "total_users": len(users),
        "events_in_window": len(recent),
        "event_breakdown": dict(name_counts.most_common(40)),
        "product": {
            "posts_created": name_counts.get("post_created", 0) or await count_since("posts", days),
            "messages_sent": name_counts.get("message_sent", 0),
            "gigs_created": name_counts.get("gig_created", 0) or await count_since("gigs", days),
            "gig_applications": name_counts.get("gig_applied", 0),
            "bands_created": name_counts.get("band_created", 0) or await count_since("bands", days),
            "studios_added": name_counts.get("studio_listed", 0) or await count_since("studios", days),
            "equipment_listed": name_counts.get("equipment_listed", 0) or await count_since("equipment", days),
            "lessons_created": name_counts.get("lesson_created", 0) or await count_since("lessons", days),
            "follows": name_counts.get("follow", 0),
        },
        "top_cities": [{"name": k, "count": v} for k, v in city_c.most_common(15)],
        "top_instruments": [{"name": k, "count": v} for k, v in inst_c.most_common(15)],
        "top_skills": [{"name": k, "count": v} for k, v in skill_c.most_common(15)],
        "top_search_keywords": [{"name": k, "count": v} for k, v in keywords.most_common(20)],
        "most_active_users": top_users,
        "growth_chart": growth,
        # Placeholders for features not yet in product
        "not_available_yet": [
            "communities", "workshops", "ticket_sales", "rentals_checkout",
            "studio_bookings", "band_invites",
        ],
    }
