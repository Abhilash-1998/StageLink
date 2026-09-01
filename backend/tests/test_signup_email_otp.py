"""Pre-signup email OTP endpoints — unit/integration tests against the FastAPI app."""
from __future__ import annotations

import uuid
from unittest.mock import patch

import jwt
import pytest
from starlette.testclient import TestClient

from server import app, JWT_SECRET, JWT_ALGO

FIXED_OTP = "482913"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _email() -> str:
    return f"otp_{uuid.uuid4().hex[:12]}@example.com"


def _verify_email(client: TestClient, email: str) -> str:
    client.post("/api/auth/send-signup-otp", json={"email": email})
    r = client.post(
        "/api/auth/verify-signup-otp",
        json={"email": email, "code": FIXED_OTP},
    )
    assert r.status_code == 200, r.text
    return r.json()["verification_token"]


@patch("services.signup_email_otp.generate_otp_code", return_value=FIXED_OTP)
def test_signup_otp_happy_path(_mock_otp, client: TestClient):
    email = _email()

    r = client.post("/api/auth/check-email", json={"email": email})
    assert r.status_code == 200
    assert r.json()["available"] is True

    r = client.post("/api/auth/send-signup-otp", json={"email": email})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["expires_in"] == 600
    assert "verification code" in body["message"].lower()

    token = _verify_email(client, email)
    assert token

    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    assert payload["sub"] == email
    assert payload["type"] == "signup_email_verify"
    assert payload["vid"]
    assert payload["jti"]


@patch("services.signup_email_otp.generate_otp_code", return_value=FIXED_OTP)
def test_register_requires_verified_email(_mock_otp, client: TestClient):
    email = _email()
    token = _verify_email(client, email)
    r = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "TestPass1",
            "full_name": "Verified User",
            "verification_token": token,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == email


@patch("services.signup_email_otp.generate_otp_code", return_value=FIXED_OTP)
def test_register_rejects_missing_verification_token(_mock_otp, client: TestClient):
    email = _email()
    r = client.post(
        "/api/auth/register",
        json={"email": email, "password": "TestPass1", "full_name": "No Token"},
    )
    assert r.status_code == 422


@patch("services.signup_email_otp.generate_otp_code", return_value=FIXED_OTP)
def test_register_rejects_email_mismatch(_mock_otp, client: TestClient):
    email = _email()
    other = _email()
    token = _verify_email(client, email)
    r = client.post(
        "/api/auth/register",
        json={
            "email": other,
            "password": "TestPass1",
            "full_name": "Mismatch",
            "verification_token": token,
        },
    )
    assert r.status_code == 400
    assert "verification" in r.json()["detail"].lower()


@patch("services.signup_email_otp.generate_otp_code", return_value=FIXED_OTP)
def test_register_rejects_reused_verification_token(_mock_otp, client: TestClient):
    email = _email()
    token = _verify_email(client, email)
    payload = {
        "email": email,
        "password": "TestPass1",
        "full_name": "First User",
        "verification_token": token,
    }
    r1 = client.post("/api/auth/register", json=payload)
    assert r1.status_code == 200, r1.text

    email2 = _email()
    r2 = client.post(
        "/api/auth/register",
        json={
            "email": email2,
            "password": "TestPass1",
            "full_name": "Second User",
            "verification_token": token,
        },
    )
    assert r2.status_code == 400


@patch("services.signup_email_otp.generate_otp_code", return_value=FIXED_OTP)
def test_register_rejects_untrusted_email_verified_field(_mock_otp, client: TestClient):
    email = _email()
    token = _verify_email(client, email)
    r = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "TestPass1",
            "full_name": "Verified User",
            "verification_token": token,
            "emailVerified": True,
        },
    )
    assert r.status_code == 422


@patch("services.signup_email_otp.generate_otp_code", return_value=FIXED_OTP)
def test_signup_otp_wrong_code(_mock_otp, client: TestClient):
    email = _email()
    client.post("/api/auth/send-signup-otp", json={"email": email})
    r = client.post(
        "/api/auth/verify-signup-otp",
        json={"email": email, "code": "000000"},
    )
    assert r.status_code == 400
    assert "invalid" in r.json()["detail"].lower()


@patch("services.signup_email_otp.generate_otp_code", return_value=FIXED_OTP)
def test_signup_otp_registered_email_uniform_send(_mock_otp, client: TestClient):
    email = _email()
    token = _verify_email(client, email)
    reg = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "TestPass1",
            "full_name": "OTP Test",
            "verification_token": token,
        },
    )
    assert reg.status_code == 200

    r = client.post("/api/auth/send-signup-otp", json={"email": email})
    assert r.status_code == 200
    assert r.json()["ok"] is True

    r = client.post(
        "/api/auth/verify-signup-otp",
        json={"email": email, "code": FIXED_OTP},
    )
    assert r.status_code == 400


def test_check_email_unavailable_after_register(client: TestClient):
    email = _email()
    with patch("services.signup_email_otp.generate_otp_code", return_value=FIXED_OTP):
        token = _verify_email(client, email)
        reg = client.post(
            "/api/auth/register",
            json={
                "email": email,
                "password": "TestPass1",
                "full_name": "OTP Test",
                "verification_token": token,
            },
        )
    assert reg.status_code == 200

    r = client.post("/api/auth/check-email", json={"email": email})
    assert r.status_code == 200
    assert r.json()["available"] is False


@patch("services.signup_email_otp.generate_otp_code", return_value=FIXED_OTP)
def test_signup_otp_resend_cooldown(_mock_otp, client: TestClient):
    email = _email()
    r1 = client.post("/api/auth/send-signup-otp", json={"email": email})
    assert r1.status_code == 200
    r2 = client.post("/api/auth/send-signup-otp", json={"email": email})
    assert r2.status_code == 429


def test_verify_signup_otp_invalid_code_format(client: TestClient):
    email = _email()
    r = client.post(
        "/api/auth/verify-signup-otp",
        json={"email": email, "code": "abc"},
    )
    assert r.status_code == 422
