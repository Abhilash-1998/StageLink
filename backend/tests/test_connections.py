"""
Iteration 6 backend tests — Followers/Following endpoints + regression.

New:
  - GET /api/users/{uid}/followers → list summary
  - GET /api/users/{uid}/following → list summary
  - POST /api/follow/{target_id} → toggle follow; verify list membership
  - GET /api/profile/musician/{uid} now includes 'following' count

Regression (iteration 5):
  - POST /api/posts/comment, DELETE /api/comments/{cid}
  - PATCH/DELETE /api/posts/{pid}
  - discover endpoints

No seed/demo accounts — uses musician_a/musician_b fixtures (+ third musician).
"""
import time
import pytest
from conftest import BASE_URL, make_musician


@pytest.fixture(scope="module")
def ariya(musician_a):
    return musician_a


@pytest.fixture(scope="module")
def kabir(musician_b):
    return musician_b


@pytest.fixture(scope="module")
def naina(api_client):
    return make_musician(api_client, "Musician C")


# -------------------- Sanity --------------------
class TestSanity:
    def test_login_all(self, ariya, kabir, naina):
        assert ariya["token"] and kabir["token"] and naina["token"]


# -------------------- New endpoints --------------------
class TestConnectionListsShape:
    def test_followers_shape(self, api_client, ariya):
        r = api_client.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        for item in data:
            assert "id" in item
            assert "full_name" in item
            assert "avatar_url" in item
            assert "verified" in item
            assert "tagline" in item and "city" in item

    def test_following_shape(self, api_client, ariya):
        r = api_client.get(f"{BASE_URL}/api/users/{ariya['user_id']}/following")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


class TestFollowToggleReflectsInLists:
    def test_follow_and_verify_lists(self, api_client, ariya, kabir):
        """kabir follows ariya → ariya.followers contains kabir; kabir.following contains ariya."""
        r0 = api_client.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=kabir["h"])
        assert r0.status_code == 200
        if r0.json().get("following") is False:
            r1 = api_client.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=kabir["h"])
            assert r1.status_code == 200 and r1.json().get("following") is True
        else:
            assert r0.json().get("following") is True

        try:
            rf = api_client.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
            assert rf.status_code == 200
            follower_ids = [x["id"] for x in rf.json()]
            assert kabir["user_id"] in follower_ids, follower_ids

            rf2 = api_client.get(f"{BASE_URL}/api/users/{kabir['user_id']}/following")
            assert rf2.status_code == 200
            following_ids = [x["id"] for x in rf2.json()]
            assert ariya["user_id"] in following_ids, following_ids

            rp = api_client.get(f"{BASE_URL}/api/profile/musician/{ariya['user_id']}",
                                headers=ariya["h"])
            assert rp.status_code == 200
            d = rp.json()
            assert "followers" in d and d["followers"] >= 1
            assert "following" in d, f"'following' missing from profile: {list(d.keys())}"
            assert isinstance(d["following"], int)
        finally:
            r_off = api_client.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=kabir["h"])
            assert r_off.status_code == 200
            rf3 = api_client.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
            assert kabir["user_id"] not in [x["id"] for x in rf3.json()]

    def test_cannot_follow_self(self, api_client, ariya):
        r = api_client.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=ariya["h"])
        assert r.status_code == 400

    def test_order_most_recent_first(self, api_client, ariya, kabir, naina):
        """kabir then naina follow ariya → ariya.followers[0] should be naina (most recent first)."""
        for follower in (kabir, naina):
            r = api_client.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
            ids = [x["id"] for x in r.json()]
            if follower["user_id"] in ids:
                api_client.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=follower["h"])

        try:
            r1 = api_client.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=kabir["h"])
            assert r1.status_code == 200 and r1.json()["following"] is True
            time.sleep(1.1)
            r2 = api_client.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=naina["h"])
            assert r2.status_code == 200 and r2.json()["following"] is True

            rf = api_client.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
            ids = [x["id"] for x in rf.json()]
            assert kabir["user_id"] in ids and naina["user_id"] in ids
            assert ids.index(naina["user_id"]) < ids.index(kabir["user_id"]), ids
        finally:
            for follower in (kabir, naina):
                r = api_client.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
                ids = [x["id"] for x in r.json()]
                if follower["user_id"] in ids:
                    api_client.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=follower["h"])


# -------------------- Regression: iteration 5 endpoints --------------------
class TestIteration5Regression:
    def test_post_comment_and_delete(self, api_client, ariya, kabir):
        rp = api_client.post(f"{BASE_URL}/api/posts", json={"text": "TEST_iter6_regression"},
                             headers=ariya["h"])
        assert rp.status_code == 200
        pid = rp.json()["id"]
        try:
            rc = api_client.post(f"{BASE_URL}/api/posts/comment",
                                 json={"post_id": pid, "text": "TEST_reg_comment"},
                                 headers=kabir["h"])
            assert rc.status_code == 200, rc.text
            cid = rc.json()["id"]
            rd = api_client.delete(f"{BASE_URL}/api/comments/{cid}", headers=kabir["h"])
            assert rd.status_code == 200
        finally:
            api_client.delete(f"{BASE_URL}/api/posts/{pid}", headers=ariya["h"])

    def test_patch_post(self, api_client, ariya):
        rp = api_client.post(f"{BASE_URL}/api/posts", json={"text": "TEST_iter6_patch"},
                             headers=ariya["h"])
        pid = rp.json()["id"]
        try:
            rr = api_client.patch(f"{BASE_URL}/api/posts/{pid}", json={"text": "TEST_iter6_patched"},
                                  headers=ariya["h"])
            assert rr.status_code == 200
            assert rr.json()["text"] == "TEST_iter6_patched"
        finally:
            api_client.delete(f"{BASE_URL}/api/posts/{pid}", headers=ariya["h"])

    def test_discover_endpoints_ok(self, api_client):
        for ent in ("musicians", "bands", "studios", "equipment", "lessons", "gigs"):
            r = api_client.get(f"{BASE_URL}/api/{ent}")
            assert r.status_code == 200, f"{ent}: {r.status_code} {r.text}"
            assert isinstance(r.json(), list)


# -------------------- Band create without cover --------------------
class TestBandCreationNoCover:
    def test_create_band_without_cover(self, api_client, ariya):
        """Creating a band without cover_url is allowed."""
        payload = {"name": "TEST_iter6_band_default", "genres": ["Jazz"], "city": "Hyderabad"}
        r = api_client.post(f"{BASE_URL}/api/bands", json=payload, headers=ariya["h"])
        assert r.status_code == 200, r.text
        bid = r.json()["id"]
        try:
            re = api_client.get(f"{BASE_URL}/api/entities/mine", headers=ariya["h"])
            assert re.status_code == 200
            band_ids = [b["id"] for b in re.json().get("bands", [])]
            assert bid in band_ids
        finally:
            api_client.delete(f"{BASE_URL}/api/bands/{bid}", headers=ariya["h"])
