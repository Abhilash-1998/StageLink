"""gigZee Iteration 2 — Action-Based Architecture tests.

Focus: new entities (bands, equipment, studios, lessons, posts),
community feed w/ likes+comments, /entities/mine, action-based create
(no role gating), auto-add active_role.

No seed/demo accounts — tests create users and data via API.
"""
import uuid
from conftest import BASE_URL, make_musician, make_organizer, register_user


def _hdr(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


# ---------------- Dual roles from helpers ----------------
class TestDualRoles:
    def test_make_musician_has_both_roles(self, api_client):
        m = make_musician(api_client, "Dual Role Musician")
        roles = m["user"]["roles"]
        assert "musician" in roles and "organizer" in roles, f"Expected both roles, got {roles}"

    def test_make_organizer_has_both_roles(self, api_client):
        o = make_organizer(api_client, "Dual Role Organizer")
        roles = o["user"]["roles"]
        assert "musician" in roles and "organizer" in roles, f"Expected both roles, got {roles}"


# ---------------- Active-role auto-adds missing role ----------------
class TestActiveRoleAutoAdd:
    def test_active_role_auto_adds_when_missing(self, api_client):
        u = register_user(api_client, full_name="TEST User")
        r = api_client.post(f"{BASE_URL}/api/auth/active-role",
                            json={"active_role": "musician"}, headers=_hdr(u["token"]))
        assert r.status_code == 200, f"Expected 200 (auto-add), got {r.status_code}: {r.text}"
        u_resp = r.json()
        assert "musician" in u_resp["roles"]
        assert u_resp["active_role"] == "musician"

    def test_active_role_switch_to_organizer(self, api_client, musician_a):
        r = api_client.post(f"{BASE_URL}/api/auth/active-role",
                            json={"active_role": "organizer"}, headers=musician_a["h"])
        assert r.status_code == 200
        assert r.json()["active_role"] == "organizer"
        # restore
        api_client.post(f"{BASE_URL}/api/auth/active-role",
                        json={"active_role": "musician"}, headers=musician_a["h"])


# ---------------- Gigs: no role gate ----------------
class TestGigsActionBased:
    def test_any_user_can_create_gig(self, api_client):
        u = register_user(api_client, full_name="TEST User")
        payload = {"title": "TEST Gig Any User", "city": "Hyderabad", "date": "2026-06-01",
                   "event_type": "club", "genre": "Jazz", "instrument_needed": "Vocals",
                   "budget": 15000, "description": "test"}
        r = api_client.post(f"{BASE_URL}/api/gigs", json=payload, headers=_hdr(u["token"]))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST Gig Any User"
        assert d["organizer_id"] == u["id"]


# ---------------- Applications: no role gate ----------------
class TestApplicationsActionBased:
    def test_any_user_can_apply(self, api_client, organizer_a):
        payload = {"title": f"TEST Apply Gig {uuid.uuid4().hex[:6]}", "city": "Hyderabad",
                   "date": "2026-06-01", "event_type": "club", "genre": "Jazz",
                   "instrument_needed": "Vocals", "budget": 10000, "description": "test"}
        gr = api_client.post(f"{BASE_URL}/api/gigs", json=payload, headers=organizer_a["h"])
        assert gr.status_code == 200, gr.text
        gid = gr.json()["id"]

        u = register_user(api_client, full_name="TEST Applicant")
        r = api_client.post(f"{BASE_URL}/api/applications",
                            json={"gig_id": gid, "message": "test"}, headers=_hdr(u["token"]))
        assert r.status_code == 200, r.text
        assert r.json()["gig_id"] == gid


# ---------------- Bands ----------------
class TestBands:
    def test_list_created_bands(self, api_client, musician_a):
        names = [f"TEST Band Kolaba {uuid.uuid4().hex[:6]}", f"TEST Band Signal {uuid.uuid4().hex[:6]}"]
        for name in names:
            r = api_client.post(
                f"{BASE_URL}/api/bands",
                json={"name": name, "city": "Hyderabad", "genres": ["Jazz"], "description": "test"},
                headers=musician_a["h"],
            )
            assert r.status_code == 200, r.text

        r = api_client.get(f"{BASE_URL}/api/bands")
        assert r.status_code == 200
        listed = [b["name"] for b in r.json()]
        for name in names:
            assert name in listed, f"Expected {name} in {listed}"

    def test_create_band(self, api_client, musician_a):
        payload = {"name": f"TEST Band {uuid.uuid4().hex[:6]}", "city": "Hyderabad",
                   "genres": ["Jazz"], "description": "test band", "looking_for": ["Drummer"]}
        r = api_client.post(f"{BASE_URL}/api/bands", json=payload, headers=musician_a["h"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == payload["name"]
        assert d["owner_id"] == musician_a["id"]


# ---------------- Equipment ----------------
class TestEquipment:
    def test_list_created_equipment(self, api_client, musician_a):
        items = [
            {"title": f"TEST Fender {uuid.uuid4().hex[:6]}", "listing_type": "rent",
             "category": "Guitar", "city": "Hyderabad", "price": 2000, "description": "test"},
            {"title": f"TEST SM58 {uuid.uuid4().hex[:6]}", "listing_type": "rent",
             "category": "Mic", "city": "Hyderabad", "price": 500, "description": "test"},
            {"title": f"TEST CDJ {uuid.uuid4().hex[:6]}", "listing_type": "sell",
             "category": "DJ", "city": "Hyderabad", "price": 8000, "description": "test"},
        ]
        for payload in items:
            r = api_client.post(f"{BASE_URL}/api/equipment", json=payload, headers=musician_a["h"])
            assert r.status_code == 200, r.text

        r = api_client.get(f"{BASE_URL}/api/equipment")
        assert r.status_code == 200
        eq = r.json()
        titles = " ".join(e["title"] for e in eq)
        assert "Fender" in titles
        assert "SM58" in titles
        assert "CDJ" in titles
        created_titles = {p["title"] for p in items}
        listed_titles = {e["title"] for e in eq}
        assert created_titles.issubset(listed_titles)

    def test_create_equipment(self, api_client, musician_a):
        payload = {"title": f"TEST Amp {uuid.uuid4().hex[:6]}", "listing_type": "rent",
                   "category": "Amp", "city": "Hyderabad", "price": 1000, "description": "test"}
        r = api_client.post(f"{BASE_URL}/api/equipment", json=payload, headers=musician_a["h"])
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

    def test_create_studio(self, api_client, musician_a):
        payload = {"name": f"TEST Studio {uuid.uuid4().hex[:6]}", "city": "Hyderabad",
                   "hourly_rate": 1500, "description": "test studio"}
        r = api_client.post(f"{BASE_URL}/api/studios", json=payload, headers=musician_a["h"])
        assert r.status_code == 200, r.text
        assert r.json()["name"] == payload["name"]


# ---------------- Lessons ----------------
class TestLessons:
    def test_list_lessons(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/lessons")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_lesson(self, api_client, musician_a):
        payload = {"title": f"TEST Lesson {uuid.uuid4().hex[:6]}", "subject": "Piano",
                   "city": "Hyderabad", "price_per_hour": 1000, "format": "online",
                   "description": "test lesson"}
        r = api_client.post(f"{BASE_URL}/api/lessons", json=payload, headers=musician_a["h"])
        assert r.status_code == 200, r.text
        assert r.json()["title"] == payload["title"]


# ---------------- Community Feed / Posts ----------------
class TestPosts:
    def test_feed_returns_posts_with_fields(self, api_client, musician_a):
        for i in range(4):
            r = api_client.post(
                f"{BASE_URL}/api/posts",
                json={"text": f"TEST feed post {i} {uuid.uuid4().hex[:6]}"},
                headers=musician_a["h"],
            )
            assert r.status_code == 200, r.text

        r = api_client.get(f"{BASE_URL}/api/posts/feed", headers=musician_a["h"])
        assert r.status_code == 200, r.text
        posts = r.json()
        assert len(posts) >= 4, f"Expected >=4 posts after create, got {len(posts)}"
        for p in posts:
            assert "author_name" in p
            assert "like_count" in p
            assert "comment_count" in p
            assert "liked" in p

    def test_create_post(self, api_client, musician_a):
        r = api_client.post(f"{BASE_URL}/api/posts",
                            json={"text": f"TEST post {uuid.uuid4().hex[:6]}"},
                            headers=musician_a["h"])
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["author_id"] == musician_a["id"]
        assert d["like_count"] == 0

    def test_like_toggle(self, api_client, musician_a):
        new_post = api_client.post(
            f"{BASE_URL}/api/posts",
            json={"text": f"TEST like target {uuid.uuid4().hex[:6]}"},
            headers=musician_a["h"],
        ).json()
        pid = new_post["id"]
        posts = api_client.get(f"{BASE_URL}/api/posts/feed", headers=musician_a["h"]).json()
        p0 = next(p for p in posts if p["id"] == pid)
        initial_count = p0["like_count"]
        initial_liked = p0["liked"]

        r1 = api_client.post(f"{BASE_URL}/api/posts/{pid}/like", headers=musician_a["h"])
        assert r1.status_code == 200, r1.text
        state1 = r1.json()["liked"]
        assert state1 != initial_liked

        feed2 = api_client.get(f"{BASE_URL}/api/posts/feed", headers=musician_a["h"]).json()
        p2 = next(p for p in feed2 if p["id"] == pid)
        if state1:
            assert p2["like_count"] == initial_count + 1
        else:
            assert p2["like_count"] == initial_count - 1

        r2 = api_client.post(f"{BASE_URL}/api/posts/{pid}/like", headers=musician_a["h"])
        assert r2.status_code == 200
        assert r2.json()["liked"] == initial_liked

    def test_add_comment_increments_count(self, api_client, musician_a):
        new_post = api_client.post(
            f"{BASE_URL}/api/posts",
            json={"text": f"TEST for comment {uuid.uuid4().hex[:6]}"},
            headers=musician_a["h"],
        ).json()
        pid = new_post["id"]
        assert new_post["comment_count"] == 0

        r = api_client.post(f"{BASE_URL}/api/posts/comment",
                            json={"post_id": pid, "text": "great!"},
                            headers=musician_a["h"])
        assert r.status_code == 200, r.text
        assert r.json()["post_id"] == pid

        detail = api_client.get(f"{BASE_URL}/api/posts/{pid}", headers=musician_a["h"]).json()
        assert detail["post"]["comment_count"] == 1
        assert len(detail["comments"]) == 1


# ---------------- /entities/mine ----------------
class TestEntitiesMine:
    def test_mine_returns_all_categories(self, api_client, musician_a):
        r = api_client.get(f"{BASE_URL}/api/entities/mine", headers=musician_a["h"])
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("gigs", "bands", "equipment", "studios", "lessons", "posts"):
            assert key in d, f"Missing key {key}"
            assert isinstance(d[key], list)
