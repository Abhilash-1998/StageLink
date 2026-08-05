"""Onboarding + profile option configs are backend-driven."""
import uuid


def test_get_onboarding_config_public(api_client):
    r = api_client.get("/api/config/onboarding")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "Hyderabad" in data["cities"]
    assert data["default_city"] == "Hyderabad"
    assert isinstance(data["interests"], list) and len(data["interests"]) >= 1
    assert data["interests_prompt"]
    assert data["city_note"]


def test_put_onboarding_config_updates_interests(api_client):
    email = f"cfg_{uuid.uuid4().hex[:8]}@example.com"
    reg = api_client.post("/api/auth/register", json={
        "email": email, "password": "Test1234", "full_name": "Config Tester",
    })
    assert reg.status_code in (200, 201), reg.text
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    new_interests = ["Perform", "Teach", "Book studios", "Custom interest"]
    put = api_client.put("/api/config/onboarding", headers=headers, json={
        "interests": new_interests,
        "interests_prompt": "What are you here for?",
    })
    assert put.status_code == 200, put.text
    body = put.json()
    assert body["interests"] == new_interests
    assert body["interests_prompt"] == "What are you here for?"

    get = api_client.get("/api/config/onboarding")
    assert get.status_code == 200
    assert get.json()["interests"] == new_interests


def test_get_profile_options_public(api_client):
    r = api_client.get("/api/config/profile-options")
    assert r.status_code == 200, r.text
    data = r.json()
    for key in ("professions", "skills", "genres", "instruments", "languages", "pricing_types"):
        assert key in data
        assert isinstance(data[key], list) and len(data[key]) >= 1
    assert "per_event" in data["pricing_types"]
    assert "per_session" in data["pricing_types"]


def test_put_profile_options_updates_genres(api_client):
    email = f"popt_{uuid.uuid4().hex[:8]}@example.com"
    reg = api_client.post("/api/auth/register", json={
        "email": email, "password": "Test1234", "full_name": "Options Tester",
    })
    assert reg.status_code in (200, 201), reg.text
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    new_genres = ["Jazz", "Indie", "Telugu Folk"]
    put = api_client.put("/api/config/profile-options", headers=headers, json={
        "genres": new_genres,
    })
    assert put.status_code == 200, put.text
    assert put.json()["genres"] == new_genres

    get = api_client.get("/api/config/profile-options")
    assert get.status_code == 200
    assert get.json()["genres"] == new_genres
    # other keys still present
    assert len(get.json()["professions"]) >= 1
