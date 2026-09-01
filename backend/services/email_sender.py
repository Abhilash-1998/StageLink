"""Transactional email delivery (Resend). Falls back to logging when not configured."""
from __future__ import annotations

import logging
import os

log = logging.getLogger("gigze.email")

APP_NAME = (os.getenv("APP_NAME") or "gigZee").strip()
_BUILD_MARKER = "otp-html-v2"


def _clean_env(value: str | None) -> str:
    """Strip whitespace and optional surrounding quotes from env values."""
    val = (value or "").strip()
    if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
        val = val[1:-1].strip()
    return val


def resend_settings() -> tuple[str, str]:
    return (
        _clean_env(os.getenv("RESEND_API_KEY")),
        _clean_env(os.getenv("RESEND_FROM_EMAIL")),
    )


def resend_configured() -> bool:
    api_key, from_email = resend_settings()
    return bool(api_key and from_email)


def resend_diagnostics() -> dict:
    """Safe runtime diagnostics — never exposes secrets or OTPs."""
    api_key, from_email = resend_settings()
    domain = ""
    if "@" in from_email:
        domain = from_email.split("@")[-1]
    missing = []
    if not api_key:
        missing.append("RESEND_API_KEY")
    if not from_email:
        missing.append("RESEND_FROM_EMAIL")
    sandbox_note = None
    if from_email == "onboarding@resend.dev":
        sandbox_note = (
            "Resend sandbox: emails only deliver to the address on your Resend account."
        )
    return {
        "build_marker": _BUILD_MARKER,
        "resend_api_key_present": bool(api_key),
        "resend_api_key_prefix": api_key[:3] if api_key else None,
        "resend_from_email": from_email or None,
        "resend_from_domain": domain or None,
        "resend_configured": bool(api_key and from_email),
        "missing_env_vars": missing,
        "sandbox_note": sandbox_note,
    }


def _otp_subject() -> str:
    return f"{APP_NAME} signup verification code"


def _otp_text(otp_code: str) -> str:
    return (
        f"Your {APP_NAME} verification code is: {otp_code}\n\n"
        f"This code expires in 10 minutes. If you did not request this, you can ignore this email."
    )


def _otp_html(otp_code: str) -> str:
    return f"""<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #18181b; line-height: 1.5;">
    <p>Your {APP_NAME} verification code is:</p>
    <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">{otp_code}</p>
    <p style="color: #52525b;">This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
  </body>
</html>"""


def _mask_email(email: str) -> str:
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = local[:1] + "*"
    else:
        masked_local = local[:2] + "***"
    return f"{masked_local}@{domain}"


async def send_signup_otp_email(*, to_email: str, otp_code: str) -> bool:
    """Deliver a signup OTP email via Resend.

    Returns True when Resend accepted the message, False when skipped or failed.
    Never raises — signup API keeps a uniform response.
    """
    api_key, from_email = resend_settings()
    subject = _otp_subject()
    recipient = (to_email or "").strip().lower()

    if not api_key or not from_email:
        log.warning(
            "Signup OTP email skipped (Resend not configured) from=%s to=%s api_key_present=%s from_present=%s",
            from_email or "(missing)",
            _mask_email(recipient),
            bool(api_key),
            bool(from_email),
        )
        return False

    payload = {
        "from": from_email,
        "to": [recipient],
        "subject": subject,
        "text": _otp_text(otp_code),
        "html": _otp_html(otp_code),
    }

    log.info(
        "Resend signup OTP dispatch from=%s to=%s subject=%s build=%s",
        from_email,
        _mask_email(recipient),
        subject,
        _BUILD_MARKER,
    )

    try:
        import requests

        resp = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": payload["from"],
                "to": payload["to"],
                "subject": payload["subject"],
                "text": payload["text"],
                "html": payload["html"],
            },
            timeout=15,
        )
        if resp.status_code >= 400:
            log.error(
                "Resend signup OTP failed status=%s from=%s to=%s subject=%s body=%s",
                resp.status_code,
                from_email,
                _mask_email(recipient),
                subject,
                resp.text[:500],
            )
            return False

        resend_id = None
        try:
            body = resp.json()
            resend_id = body.get("id")
        except Exception:
            pass
        log.info(
            "Resend signup OTP accepted status=%s from=%s to=%s resend_id=%s",
            resp.status_code,
            from_email,
            _mask_email(recipient),
            resend_id,
        )
        return True
    except Exception:
        log.exception(
            "Resend signup OTP delivery error from=%s to=%s subject=%s",
            from_email,
            _mask_email(recipient),
            subject,
        )
        return False
