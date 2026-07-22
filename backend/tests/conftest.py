import pytest
import requests
import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / '.env')

BASE_URL = "https://gig-marketplace-pro-4.preview.emergentagent.com"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=20)
    return r


@pytest.fixture(scope="session")
def musician_token():
    r = _login("ariya.kapoor@stagelink.dev", "demo1234")
    assert r.status_code == 200, f"Musician login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def organizer_token():
    r = _login("sunset@stagelink.dev", "demo1234")
    assert r.status_code == 200, f"Organizer login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture
def musician_headers(musician_token):
    return {"Authorization": f"Bearer {musician_token}", "Content-Type": "application/json"}


@pytest.fixture
def organizer_headers(organizer_token):
    return {"Authorization": f"Bearer {organizer_token}", "Content-Type": "application/json"}
