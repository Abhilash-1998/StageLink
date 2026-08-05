"""Shared pytest fixtures. Tests create their own users — no demo/seed accounts."""
import os
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "http://localhost:8001",
).rstrip("/")


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def register_user(api: requests.Session, *, full_name: str = "Test User", password: str = "testPass1") -> dict:
    email = f"test_{uuid.uuid4().hex[:12]}@example.com"
    r = api.post(
        f"{BASE_URL}/api/auth/register",
        json={"email": email, "password": password, "full_name": full_name},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    j = r.json()
    return {
        "email": email,
        "password": password,
        "token": j["access_token"],
        "refresh": j["refresh_token"],
        "user": j["user"],
        "id": j["user"]["id"],
        "user_id": j["user"]["id"],
        "h": _headers(j["access_token"]),
    }


def set_roles(api: requests.Session, token: str, roles: list[str]) -> dict:
    r = api.post(f"{BASE_URL}/api/auth/roles", json={"roles": roles}, headers=_headers(token), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def upsert_musician(api: requests.Session, token: str, **overrides) -> None:
    payload = {
        "bio": "Test musician bio",
        "city": "Hyderabad",
        "genres": ["Jazz"],
        "instruments": ["Vocals"],
        "experience_years": 3,
        "pricing_per_hour": 3000,
        **overrides,
    }
    r = api.post(f"{BASE_URL}/api/profile/musician", json=payload, headers=_headers(token), timeout=30)
    assert r.status_code == 200, r.text


def upsert_organizer(api: requests.Session, token: str, **overrides) -> None:
    payload = {
        "org_name": "Test Org",
        "city": "Hyderabad",
        "bio": "Test organizer",
        **overrides,
    }
    r = api.post(f"{BASE_URL}/api/profile/organizer", json=payload, headers=_headers(token), timeout=30)
    assert r.status_code == 200, r.text


def make_musician(api: requests.Session, name: str = "Test Musician") -> dict:
    u = register_user(api, full_name=name)
    set_roles(api, u["token"], ["musician", "organizer"])
    api.post(
        f"{BASE_URL}/api/auth/active-role",
        json={"active_role": "musician"},
        headers=u["h"],
        timeout=30,
    )
    upsert_musician(api, u["token"])
    # refresh user after onboarding
    me = api.get(f"{BASE_URL}/api/auth/me", headers=u["h"], timeout=30)
    assert me.status_code == 200
    u["user"] = me.json()
    return u


def make_organizer(api: requests.Session, name: str = "Test Organizer") -> dict:
    u = register_user(api, full_name=name)
    set_roles(api, u["token"], ["organizer", "musician"])
    api.post(
        f"{BASE_URL}/api/auth/active-role",
        json={"active_role": "organizer"},
        headers=u["h"],
        timeout=30,
    )
    upsert_organizer(api, u["token"], org_name=name)
    me = api.get(f"{BASE_URL}/api/auth/me", headers=u["h"], timeout=30)
    assert me.status_code == 200
    u["user"] = me.json()
    return u


@pytest.fixture(scope="module")
def musician_a(api_client):
    return make_musician(api_client, "Musician A")


@pytest.fixture(scope="module")
def musician_b(api_client):
    return make_musician(api_client, "Musician B")


@pytest.fixture(scope="module")
def organizer_a(api_client):
    return make_organizer(api_client, "Organizer A")
