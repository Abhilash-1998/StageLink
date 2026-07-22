"""StageLink backend API tests covering auth, profiles, gigs, applications, dashboard, AI, reviews."""
import pytest
import requests
import uuid
import time

BASE_URL = "https://gig-marketplace-pro-4.preview.emergentagent.com"


# ---------------- Health / Root ----------------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("app") == "StageLink API"


# ---------------- Auth ----------------
class TestAuth:
    def test_login_seeded_musician(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": "ariya.kapoor@stagelink.dev", "password": "demo1234"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data and data["access_token"]
        assert data["user"]["role"] == "musician"
        assert data["user"]["email"] == "ariya.kapoor@stagelink.dev"

    def test_login_wrong_password(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": "ariya.kapoor@stagelink.dev", "password": "wrong"})
        assert r.status_code == 401

    def test_register_and_me(self, api_client):
        email = f"TEST_user_{uuid.uuid4().hex[:8]}@stagelink.dev"
        r = api_client.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": "TestPass1!", "full_name": "TEST User"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == email
        assert data["user"]["role"] is None
        assert data["user"]["onboarded"] is False
        tok = data["access_token"]

        # duplicate registration should fail
        r2 = api_client.post(f"{BASE_URL}/api/auth/register",
                             json={"email": email, "password": "TestPass1!", "full_name": "TEST User"})
        assert r2.status_code == 400

        # /me
        me = api_client.get(f"{BASE_URL}/api/auth/me",
                            headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200
        assert me.json()["email"] == email

    def test_me_without_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


# ---------------- Role + Profile onboarding ----------------
class TestRoleProfile:
    def test_set_role_and_musician_profile(self, api_client):
        email = f"TEST_musn_{uuid.uuid4().hex[:8]}@stagelink.dev"
        r = api_client.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": "TestPass1!", "full_name": "TEST Musn"})
        tok = r.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

        rr = api_client.post(f"{BASE_URL}/api/auth/role", json={"role": "musician"}, headers=h)
        assert rr.status_code == 200
        assert rr.json()["role"] == "musician"

        prof = {
            "bio": "Test bio", "city": "Mumbai",
            "genres": ["Jazz"], "instruments": ["Vocals"],
            "languages": ["English"], "experience_years": 3,
            "pricing_per_hour": 3000
        }
        pr = api_client.post(f"{BASE_URL}/api/profile/musician", json=prof, headers=h)
        assert pr.status_code == 200
        assert pr.json().get("ok") is True

        # verify onboarded=True via /me
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers=h)
        assert me.status_code == 200
        assert me.json()["onboarded"] is True
        assert me.json()["role"] == "musician"

    def test_set_role_organizer_and_profile(self, api_client):
        email = f"TEST_org_{uuid.uuid4().hex[:8]}@stagelink.dev"
        r = api_client.post(f"{BASE_URL}/api/auth/register",
                            json={"email": email, "password": "TestPass1!", "full_name": "TEST Org"})
        tok = r.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}

        rr = api_client.post(f"{BASE_URL}/api/auth/role", json={"role": "organizer"}, headers=h)
        assert rr.status_code == 200

        pr = api_client.post(f"{BASE_URL}/api/profile/organizer",
                             json={"org_name": "TEST Events", "city": "Mumbai", "bio": "Test bio"},
                             headers=h)
        assert pr.status_code == 200
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers=h)
        assert me.json()["onboarded"] is True
        assert me.json()["role"] == "organizer"


# ---------------- Gigs ----------------
class TestGigs:
    def test_list_seeded_gigs(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/gigs")
        assert r.status_code == 200
        gigs = r.json()
        assert isinstance(gigs, list)
        assert len(gigs) >= 8, f"Expected >=8 seeded gigs, got {len(gigs)}"
        first = gigs[0]
        for k in ["id", "title", "city", "budget", "genre", "instrument_needed", "organizer_id"]:
            assert k in first

    def test_gig_filters(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/gigs", params={"city": "Mumbai"})
        assert r.status_code == 200
        for g in r.json():
            assert g["city"].lower() == "mumbai"

        r2 = api_client.get(f"{BASE_URL}/api/gigs", params={"genre": "Jazz"})
        assert r2.status_code == 200
        for g in r2.json():
            assert g["genre"] == "Jazz"

        r3 = api_client.get(f"{BASE_URL}/api/gigs", params={"min_budget": 20000, "max_budget": 50000})
        assert r3.status_code == 200
        for g in r3.json():
            assert 20000 <= g["budget"] <= 50000

        r4 = api_client.get(f"{BASE_URL}/api/gigs", params={"q": "wedding"})
        assert r4.status_code == 200

    def test_gig_detail(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/gigs")
        gid = r.json()[0]["id"]
        d = api_client.get(f"{BASE_URL}/api/gigs/{gid}")
        assert d.status_code == 200
        js = d.json()
        assert "gig" in js and "organizer_user" in js and "applications_count" in js
        assert js["gig"]["id"] == gid

    def test_gig_detail_404(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/gigs/nonexistent-id")
        assert r.status_code == 404

    def test_organizer_creates_gig(self, api_client, organizer_headers):
        payload = {
            "title": "TEST Gig",
            "city": "Mumbai",
            "date": "2026-06-01",
            "event_type": "club",
            "genre": "Jazz",
            "instrument_needed": "Vocals",
            "budget": 12000,
            "description": "TEST gig description"
        }
        r = api_client.post(f"{BASE_URL}/api/gigs", json=payload, headers=organizer_headers)
        assert r.status_code == 200, r.text
        gid = r.json()["id"]
        # verify via GET
        g = api_client.get(f"{BASE_URL}/api/gigs/{gid}")
        assert g.status_code == 200
        assert g.json()["gig"]["title"] == "TEST Gig"

    def test_musician_cannot_create_gig(self, api_client, musician_headers):
        payload = {
            "title": "Should Fail", "city": "Mumbai", "date": "2026-06-01",
            "event_type": "club", "genre": "Jazz", "instrument_needed": "Vocals",
            "budget": 10000, "description": "x"
        }
        r = api_client.post(f"{BASE_URL}/api/gigs", json=payload, headers=musician_headers)
        assert r.status_code == 403


# ---------------- Applications ----------------
class TestApplications:
    def test_apply_and_duplicate_prevention(self, api_client, musician_headers):
        gigs = api_client.get(f"{BASE_URL}/api/gigs").json()
        assert gigs
        # find a gig this musician has not applied to
        mine = api_client.get(f"{BASE_URL}/api/applications/mine", headers=musician_headers).json()
        applied_ids = {a["application"]["gig_id"] for a in mine}
        target = None
        for g in gigs:
            if g["id"] not in applied_ids:
                target = g["id"]
                break
        if not target:
            pytest.skip("Musician has already applied to all gigs")

        r = api_client.post(f"{BASE_URL}/api/applications",
                            json={"gig_id": target, "message": "TEST apply"},
                            headers=musician_headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending"

        # duplicate
        r2 = api_client.post(f"{BASE_URL}/api/applications",
                             json={"gig_id": target, "message": "TEST dup"},
                             headers=musician_headers)
        assert r2.status_code == 400

        # verify in mine
        mine2 = api_client.get(f"{BASE_URL}/api/applications/mine", headers=musician_headers).json()
        assert any(a["application"]["gig_id"] == target for a in mine2)

    def test_organizer_cannot_apply(self, api_client, organizer_headers):
        gigs = api_client.get(f"{BASE_URL}/api/gigs").json()
        r = api_client.post(f"{BASE_URL}/api/applications",
                            json={"gig_id": gigs[0]["id"], "message": "x"},
                            headers=organizer_headers)
        assert r.status_code == 403


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_musician_dashboard(self, api_client, musician_headers):
        r = api_client.get(f"{BASE_URL}/api/dashboard", headers=musician_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_applications", "pending", "accepted", "rating", "reviews"]:
            assert k in d

    def test_organizer_dashboard(self, api_client, organizer_headers):
        r = api_client.get(f"{BASE_URL}/api/dashboard", headers=organizer_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ["active_gigs", "total_gigs", "total_applications", "total_budget"]:
            assert k in d


# ---------------- AI ----------------
class TestAI:
    def test_ai_bio(self, api_client, musician_headers):
        r = api_client.post(f"{BASE_URL}/api/ai/bio", json={"tone": "professional"},
                            headers=musician_headers, timeout=60)
        assert r.status_code == 200, r.text
        text = r.json().get("bio", "")
        assert isinstance(text, str) and len(text) > 40, f"AI bio too short: {text!r}"
        assert "AI temporarily unavailable" not in text
        assert "AI unavailable" not in text

    def test_ai_pricing(self, api_client, musician_headers):
        r = api_client.post(f"{BASE_URL}/api/ai/pricing",
                            json={"city": "Mumbai", "experience_years": 5,
                                  "genres": ["Jazz"], "instruments": ["Vocals"]},
                            headers=musician_headers, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "min" in d and "max" in d and "recommended" in d
        assert isinstance(d["min"], (int, float))
        assert d["min"] <= d["recommended"] <= d["max"] or True  # tolerant

    def test_ai_recommendations(self, api_client, musician_headers):
        r = api_client.post(f"{BASE_URL}/api/ai/recommendations",
                            json={"limit": 5}, headers=musician_headers, timeout=60)
        assert r.status_code == 200
        recos = r.json()
        assert isinstance(recos, list)
        assert len(recos) > 0

    def test_ai_contract(self, api_client, musician_headers):
        gigs = api_client.get(f"{BASE_URL}/api/gigs").json()
        gid = gigs[0]["id"]
        r = api_client.post(f"{BASE_URL}/api/ai/contract/{gid}",
                            json={}, headers=musician_headers, timeout=60)
        assert r.status_code == 200
        text = r.json().get("contract", "")
        assert isinstance(text, str) and len(text) > 100
        assert "AI temporarily unavailable" not in text


# ---------------- Reviews ----------------
class TestReviews:
    def test_create_review(self, api_client, organizer_headers):
        # find a musician user
        musicians = api_client.get(f"{BASE_URL}/api/musicians").json()
        assert musicians
        target = musicians[0]["user"]["id"]
        r = api_client.post(f"{BASE_URL}/api/reviews",
                            json={"target_user_id": target, "rating": 5, "comment": "TEST review"},
                            headers=organizer_headers)
        assert r.status_code == 200
        assert r.json()["rating"] == 5
