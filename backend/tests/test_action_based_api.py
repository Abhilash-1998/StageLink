"""StageLink Iteration 2 — Action-Based Architecture tests.

Focus: new entities (bands, equipment, studios, lessons, posts),
community feed w/ likes+comments, /entities/mine, action-based create
(no role gating), auto-add active_role.
"""
import uuid
import pytest
import requests
from conftest import BASE_URL

SEED_MUSICIAN = ("ariya.kapoor@stagelink.dev", "demo1234")
SEED_ORGANIZER = ("sunset@stagelink.dev", "demo1234")


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


def _login(api, email, pw):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return r.json()


def _register_fresh(api):
    email = f"TEST_{uuid.uuid4().hex[:10]}@stagelink.dev"
    r = api.post(f"{BASE_URL}/api/auth/register",
                 json={"email": email, "password": "TestPass1", "full_name": "TEST User"})
    assert r.status_code == 200, r.text
    return r.json(), email


# ---------------- Seeded users have BOTH roles ----------------
class TestSeededDualRoles:
    def test_ariya_has_both_roles(self, api_client):
        j = _login(api_client, *SEED_MUSICIAN)
        roles = j["user"]["roles"]
        assert "musician" in roles and "organizer" in roles, f"Expected both roles, got {roles}"

    def test_sunset_has_both_roles(self, api_client):
        j = _login(api_client, *SEED_ORGANIZER)
        roles = j["user"]["roles"]
        assert "musician" in roles and "organizer" in roles, f"Expected both roles, got {roles}"


# ---------------- Active-role auto-adds missing role ----------------
class TestActiveRoleAutoAdd:
    def test_active_role_auto_adds_when_missing(self, api_client):
        j, _ = _register_fresh(api_client)
        tok = j["access_token"]
        # freshly registered user has roles=[] and active_role=None
        r = api_client.post(f"{BASE_URL}/api/auth/active-role",
                            json={"active_role": "musician"}, headers=_hdr(tok))
        assert r.status_code == 200, f"Expected 200 (auto-add), got {r.status_code}: {r.text}"
        u = r.json()
        assert "musician" in u["roles"]
        assert u["active_role"] == "musician"

    def test_active_role_switch_to_organizer(self, api_client):
        j = _login(api_client, *SEED_MUSICIAN)
        tok = j["access_token"]
        r = api_client.post(f"{BASE_URL}/api/auth/active-role",
                            json={"active_role": "organizer"}, headers=_hdr(tok))
        assert r.status_code == 200
        assert r.json()["active_role"] == "organizer"
        # restore
        api_client.post(f"{BASE_URL}/api/auth/active-role",
                        json={"active_role": "musician"}, headers=_hdr(tok))


# ---------------- Gigs: no role gate ----------------
class TestGigsActionBased:
    def test_any_user_can_create_gig(self, api_client):
        j, _ = _register_fresh(api_client)
        tok = j["access_token"]
        payload = {"title": "TEST Gig Any User", "city": "Mumbai", "date": "2026-06-01",
                   "event_type": "club", "genre": "Jazz", "instrument_needed": "Vocals",
                   "budget": 15000, "description": "test"}
        r = api_client.post(f"{BASE_URL}/api/gigs", json=payload, headers=_hdr(tok))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST Gig Any User"
        assert d["organizer_id"] == j["user"]["id"]


# ---------------- Applications: no role gate ----------------
class TestApplicationsActionBased:
    def test_any_user_can_apply(self, api_client):
        # get an existing gig id
        gigs = api_client.get(f"{BASE_URL}/api/gigs").json()
        assert gigs, "No gigs seeded"
        gid = gigs[0]["id"]
        j, _ = _register_fresh(api_client)
        tok = j["access_token"]
        r = api_client.post(f"{BASE_URL}/api/applications",
                            json={"gig_id": gid, "message": "test"}, headers=_hdr(tok))
        assert r.status_code == 200, r.text
        assert r.json()["gig_id"] == gid


# ---------------- Bands ----------------
class TestBands:
    def test_list_seeded_bands(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/bands")
        assert r.status_code == 200
        bands = r.json()
        names = [b["name"] for b in bands]
        assert "Midnight Kolaba" in names, f"Expected Midnight Kolaba in {names}"
        assert "Static Signal" in names, f"Expected Static Signal in {names}"

    def test_create_band(self, api_client):
        j = _login(api_client, *SEED_MUSICIAN)
        tok = j["access_token"]
        payload = {"name": f"TEST Band {uuid.uuid4().hex[:6]}", "city": "Mumbai",
                   "genres": ["Jazz"], "description": "test band", "looking_for": ["Drummer"]}
        r = api_client.post(f"{BASE_URL}/api/bands", json=payload, headers=_hdr(tok))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == payload["name"]
        assert d["owner_id"] == j["user"]["id"]


# ---------------- Equipment ----------------
class TestEquipment:
    def test_list_seeded_equipment(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/equipment")
        assert r.status_code == 200
        eq = r.json()
        assert len(eq) >= 3, f"Expected at least 3 seeded, got {len(eq)}"
        titles = " ".join(e["title"] for e in eq)
        assert "Fender" in titles
        assert "SM58" in titles
        assert "CDJ" in titles

    def test_create_equipment(self, api_client):
        j = _login(api_client, *SEED_MUSICIAN)
        tok = j["access_token"]
        payload = {"title": f"TEST Amp {uuid.uuid4().hex[:6]}", "listing_type": "rent",
                   "category": "Amp", "city": "Mumbai", "price": 1000, "description": "test"}
        r = api_client.post(f"{BASE_URL}/api/equipment", json=payload, headers=_hdr(tok))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == payload["title"]
        assert d["listing_type"] == "rent"


# ---------------- Studios ----------------
class TestStudios:
    def test_list_studios(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/studios")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_studio(self, api_client):
        j = _login(api_client, *SEED_MUSICIAN)
        tok = j["access_token"]
        payload = {"name": f"TEST Studio {uuid.uuid4().hex[:6]}", "city": "Mumbai",
                   "hourly_rate": 1500, "description": "test studio"}
        r = api_client.post(f"{BASE_URL}/api/studios", json=payload, headers=_hdr(tok))
        assert r.status_code == 200, r.text
        assert r.json()["name"] == payload["name"]


# ---------------- Lessons ----------------
class TestLessons:
    def test_list_lessons(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/lessons")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_lesson(self, api_client):
        j = _login(api_client, *SEED_MUSICIAN)
        tok = j["access_token"]
        payload = {"title": f"TEST Lesson {uuid.uuid4().hex[:6]}", "subject": "Piano",
                   "city": "Mumbai", "price_per_hour": 1000, "format": "online",
                   "description": "test lesson"}
        r = api_client.post(f"{BASE_URL}/api/lessons", json=payload, headers=_hdr(tok))
        assert r.status_code == 200, r.text
        assert r.json()["title"] == payload["title"]


# ---------------- Community Feed / Posts ----------------
class TestPosts:
    def test_feed_returns_seeded_posts_with_fields(self, api_client):
        j = _login(api_client, *SEED_MUSICIAN)
        tok = j["access_token"]
        r = api_client.get(f"{BASE_URL}/api/posts/feed", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        posts = r.json()
        assert len(posts) >= 4, f"Expected >=4 seeded posts, got {len(posts)}"
        for p in posts:
            assert "author_name" in p
            assert "like_count" in p
            assert "comment_count" in p
            assert "liked" in p

    def test_create_post(self, api_client):
        j = _login(api_client, *SEED_MUSICIAN)
        tok = j["access_token"]
        r = api_client.post(f"{BASE_URL}/api/posts",
                            json={"text": f"TEST post {uuid.uuid4().hex[:6]}"},
                            headers=_hdr(tok))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["author_id"] == j["user"]["id"]
        assert d["like_count"] == 0

    def test_like_toggle(self, api_client):
        j = _login(api_client, *SEED_MUSICIAN)
        tok = j["access_token"]
        posts = api_client.get(f"{BASE_URL}/api/posts/feed", headers=_hdr(tok)).json()
        pid = posts[0]["id"]
        initial_count = posts[0]["like_count"]
        initial_liked = posts[0]["liked"]

        r1 = api_client.post(f"{BASE_URL}/api/posts/{pid}/like", headers=_hdr(tok))
        assert r1.status_code == 200, r1.text
        state1 = r1.json()["liked"]
        assert state1 != initial_liked

        # verify count changed
        feed2 = api_client.get(f"{BASE_URL}/api/posts/feed", headers=_hdr(tok)).json()
        p2 = next(p for p in feed2 if p["id"] == pid)
        if state1:  # now liked
            assert p2["like_count"] == initial_count + 1
        else:
            assert p2["like_count"] == initial_count - 1

        # toggle back
        r2 = api_client.post(f"{BASE_URL}/api/posts/{pid}/like", headers=_hdr(tok))
        assert r2.status_code == 200
        assert r2.json()["liked"] == initial_liked

    def test_add_comment_increments_count(self, api_client):
        j = _login(api_client, *SEED_MUSICIAN)
        tok = j["access_token"]
        # create a fresh post to isolate
        new_post = api_client.post(f"{BASE_URL}/api/posts",
                                   json={"text": f"TEST for comment {uuid.uuid4().hex[:6]}"},
                                   headers=_hdr(tok)).json()
        pid = new_post["id"]
        assert new_post["comment_count"] == 0

        r = api_client.post(f"{BASE_URL}/api/posts/comment",
                            json={"post_id": pid, "text": "great!"},
                            headers=_hdr(tok))
        assert r.status_code == 200, r.text
        assert r.json()["post_id"] == pid

        # verify count
        detail = api_client.get(f"{BASE_URL}/api/posts/{pid}", headers=_hdr(tok)).json()
        assert detail["post"]["comment_count"] == 1
        assert len(detail["comments"]) == 1


# ---------------- /entities/mine ----------------
class TestEntitiesMine:
    def test_mine_returns_all_categories(self, api_client):
        j = _login(api_client, *SEED_MUSICIAN)
        tok = j["access_token"]
        r = api_client.get(f"{BASE_URL}/api/entities/mine", headers=_hdr(tok))
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("gigs", "bands", "equipment", "studios", "lessons", "posts"):
            assert key in d, f"Missing key {key}"
            assert isinstance(d[key], list)
