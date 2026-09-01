"""Pre-signup email OTP verification (separate from password-reset flows)."""
from __future__ import annotations

import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import HTTPException

from email_verification_store import (
    PURPOSE_SIGNUP,
    bump_rate_limit,
    count_sends_since,
    create_signup_verification,
    get_active_signup_verification,
    get_last_sent_at,
    get_verification_by_id,
    increment_attempts,
    mark_otp_consumed,
    mark_signup_token_consumed,
)
from pg_store import db
from services.email_sender import send_signup_otp_email, resend_configured

log = logging.getLogger("gigze.signup_otp")

JWT_SECRET = os.environ.get("JWT_SECRET", "stagelink-dev-secret-change-me")
JWT_ALGO = "HS256"

OTP_TTL_SECONDS = int(os.getenv("SIGNUP_OTP_TTL_SECONDS", "600"))
RESEND_COOLDOWN_SECONDS = int(os.getenv("SIGNUP_OTP_RESEND_COOLDOWN_SECONDS", "60"))
MAX_VERIFY_ATTEMPTS = int(os.getenv("SIGNUP_OTP_MAX_ATTEMPTS", "5"))
MAX_SENDS_PER_HOUR = int(os.getenv("SIGNUP_OTP_MAX_SENDS_PER_HOUR", "5"))
MAX_IP_REQUESTS_PER_HOUR = int(os.getenv("SIGNUP_OTP_MAX_IP_PER_HOUR", "30"))
VERIFY_TOKEN_TTL_SECONDS = int(os.getenv("SIGNUP_VERIFICATION_TOKEN_TTL_SECONDS", "900"))

OTP_CODE_RE = re.compile(r"^\d{6}$")
GENERIC_OTP_ERROR = "Invalid or expired verification code."
GENERIC_SEND_OK = "If this email can be used for signup, a verification code was sent."


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def generate_otp_code() -> str:
    return f"{secrets.randbelow(900_000) + 100_000:06d}"


def hash_otp(code: str) -> str:
    return bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()


def verify_otp(code: str, otp_hash: str) -> bool:
    try:
        return bcrypt.checkpw(code.encode(), otp_hash.encode())
    except Exception:
        return False


def _client_ip(ip: str | None) -> str:
    return (ip or "unknown").strip() or "unknown"


async def _enforce_ip_rate_limit(ip: str | None) -> None:
    bucket = f"signup_otp:ip:{_client_ip(ip)}"
    count = await bump_rate_limit(bucket)
    if count > MAX_IP_REQUESTS_PER_HOUR:
        raise HTTPException(429, "Too many requests. Please try again later.")


def _mask_email(email: str) -> str:
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    masked_local = local[:2] + "***" if len(local) > 2 else local[:1] + "*"
    return f"{masked_local}@{domain}"


async def check_email_for_signup(email: str, *, client_ip: str | None = None) -> dict:
    """Return whether an email is available for signup (format validated upstream)."""
    await _enforce_ip_rate_limit(client_ip)
    normalized = normalize_email(email)
    existing = await db.users.find_one({"email": normalized}, {"_id": 0, "id": 1})
    return {"available": existing is None}


async def send_signup_otp(email: str, *, client_ip: str | None = None) -> dict:
    normalized = normalize_email(email)
    await _enforce_ip_rate_limit(client_ip)

    # Anti-enumeration: uniform success response when email is already registered.
    if await db.users.find_one({"email": normalized}, {"_id": 0, "id": 1}):
        log.info("Signup OTP skipped — email already registered: %s", normalized)
        return {
            "ok": True,
            "message": GENERIC_SEND_OK,
            "expires_in": OTP_TTL_SECONDS,
            "resend_after": RESEND_COOLDOWN_SECONDS,
        }

    email_bucket = f"signup_otp:email:{normalized}"
    email_req_count = await bump_rate_limit(email_bucket)
    if email_req_count > MAX_SENDS_PER_HOUR:
        raise HTTPException(429, "Too many verification requests for this email. Try again later.")

    now = _utcnow()
    last_sent = await get_last_sent_at(normalized, PURPOSE_SIGNUP)
    if last_sent and (now - last_sent).total_seconds() < RESEND_COOLDOWN_SECONDS:
        retry_after = int(RESEND_COOLDOWN_SECONDS - (now - last_sent).total_seconds())
        raise HTTPException(
            429,
            detail={
                "message": "Please wait before requesting another code.",
                "retry_after": max(1, retry_after),
            },
        )

    sends_last_hour = await count_sends_since(
        normalized, PURPOSE_SIGNUP, now - timedelta(hours=1)
    )
    if sends_last_hour >= MAX_SENDS_PER_HOUR:
        raise HTTPException(429, "Too many verification codes sent. Try again later.")

    code = generate_otp_code()
    expires_at = now + timedelta(seconds=OTP_TTL_SECONDS)
    await create_signup_verification(
        email=normalized,
        otp_hash=hash_otp(code),
        expires_at=expires_at,
        max_attempts=MAX_VERIFY_ATTEMPTS,
    )

    log.info(
        "Signup OTP invoking email sender resend_configured=%s email=%s",
        resend_configured(),
        _mask_email(normalized),
    )
    delivered = await send_signup_otp_email(to_email=normalized, otp_code=code)
    if not delivered:
        log.warning(
            "Signup OTP stored but email not delivered email=%s resend_configured=%s",
            _mask_email(normalized),
            resend_configured(),
        )
    else:
        log.info("Signup OTP stored and email dispatch accepted email=%s", _mask_email(normalized))

    return {
        "ok": True,
        "message": GENERIC_SEND_OK,
        "expires_in": OTP_TTL_SECONDS,
        "resend_after": RESEND_COOLDOWN_SECONDS,
    }


async def verify_signup_otp(email: str, code: str, *, client_ip: str | None = None) -> dict:
    normalized = normalize_email(email)
    await _enforce_ip_rate_limit(client_ip)

    if not OTP_CODE_RE.fullmatch((code or "").strip()):
        raise HTTPException(400, GENERIC_OTP_ERROR)

    verification = await get_active_signup_verification(normalized)
    if not verification:
        raise HTTPException(400, GENERIC_OTP_ERROR)

    if verification.attempts >= verification.max_attempts:
        raise HTTPException(400, GENERIC_OTP_ERROR)

    if not verify_otp(code.strip(), verification.otp_hash):
        attempts = await increment_attempts(verification.id)
        if attempts >= verification.max_attempts:
            log.info("Signup OTP locked after max attempts email=%s", normalized)
        raise HTTPException(400, GENERIC_OTP_ERROR)

    token_jti = str(uuid.uuid4())
    await mark_otp_consumed(verification.id, token_jti)

    token = jwt.encode(
        {
            "sub": normalized,
            "type": "signup_email_verify",
            "vid": verification.id,
            "jti": token_jti,
            "exp": _utcnow() + timedelta(seconds=VERIFY_TOKEN_TTL_SECONDS),
        },
        JWT_SECRET,
        algorithm=JWT_ALGO,
    )

    return {
        "verification_token": token,
        "expires_in": VERIFY_TOKEN_TTL_SECONDS,
    }


async def assert_signup_verification_token(token: str, email: str) -> None:
    """Validate a signup verification JWT for Phase 2 register (not wired yet)."""
    normalized = normalize_email(email)
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(400, "Email verification expired. Please verify your email again.")
    except Exception:
        raise HTTPException(400, "Invalid email verification.")

    if payload.get("type") != "signup_email_verify":
        raise HTTPException(400, "Invalid email verification.")
    if payload.get("sub") != normalized:
        raise HTTPException(400, "Invalid email verification.")

    vid = payload.get("vid")
    jti = payload.get("jti")
    if not vid or not jti:
        raise HTTPException(400, "Invalid email verification.")

    row = await get_verification_by_id(str(vid))
    if (
        not row
        or row.email != normalized
        or row.purpose != PURPOSE_SIGNUP
        or row.token_jti != str(jti)
        or not row.consumed_at
        or row.token_consumed_at
    ):
        raise HTTPException(400, "Invalid email verification.")

    if not await mark_signup_token_consumed(str(vid), str(jti)):
        raise HTTPException(400, "Invalid email verification.")
