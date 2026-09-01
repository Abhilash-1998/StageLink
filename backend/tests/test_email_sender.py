"""Unit tests for Resend email sender (mocked — no real API key)."""
import asyncio
from unittest.mock import MagicMock, patch

import services.email_sender as email_sender


def test_send_signup_otp_email_includes_code(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = '{"id":"email_123"}'
    mock_resp.json.return_value = {"id": "email_123"}

    with patch("requests.post", return_value=mock_resp) as post:
        ok = asyncio.run(
            email_sender.send_signup_otp_email(to_email="owner@example.com", otp_code="482913")
        )

    assert ok is True
    kwargs = post.call_args.kwargs
    payload = kwargs["json"]
    assert payload["from"] == "onboarding@resend.dev"
    assert payload["to"] == ["owner@example.com"]
    assert payload["subject"] == "gigZee signup verification code"
    assert "482913" in payload["text"]
    assert "482913" in payload["html"]
    assert "Hello World" not in payload["text"]
    assert "Congrats on sending" not in payload["html"]
    assert kwargs["headers"]["Authorization"] == "Bearer re_test_key"


def test_send_signup_otp_skips_when_not_configured(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("RESEND_FROM_EMAIL", raising=False)

    with patch("requests.post") as post:
        ok = asyncio.run(
            email_sender.send_signup_otp_email(to_email="owner@example.com", otp_code="482913")
        )

    assert ok is False
    post.assert_not_called()


def test_resend_diagnostics_never_exposes_full_api_key(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_live_secret_key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")
    diag = email_sender.resend_diagnostics()
    assert diag["resend_configured"] is True
    assert diag["resend_api_key_present"] is True
    assert diag["resend_api_key_prefix"] == "re_"
    assert "secret" not in str(diag)


def test_clean_env_strips_quotes(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", '"onboarding@resend.dev"')
    _, from_email = email_sender.resend_settings()
    assert from_email == "onboarding@resend.dev"


def test_resend_diagnostics_lists_missing_env(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")
    diag = email_sender.resend_diagnostics()
    assert diag["missing_env_vars"] == ["RESEND_API_KEY"]
    assert diag["sandbox_note"] is not None


def test_send_signup_otp_logs_resend_failure(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")

    mock_resp = MagicMock()
    mock_resp.status_code = 403
    mock_resp.text = '{"message":"testing restriction"}'

    with patch("requests.post", return_value=mock_resp) as post:
        ok = asyncio.run(
            email_sender.send_signup_otp_email(to_email="other@example.com", otp_code="482913")
        )

    assert ok is False
    post.assert_called_once()
