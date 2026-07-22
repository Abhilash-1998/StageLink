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
"""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / 'frontend' / '.env')
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')

ARIYA = ("ariya.kapoor@stagelink.dev", "demo1234")
KABIR = ("kabir.rao@stagelink.dev", "demo1234")
NAINA = ("naina.iyer@stagelink.dev", "demo1234")


def _login(email: str, pw: str) -> dict:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    d = r.json()
    tok = d.get('access_token') or d.get('token')
    uid = (d.get('user') or {}).get('id') or d.get('user_id')
    assert tok and uid
    return {"token": tok, "user_id": uid, "user": d.get('user', {})}


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def ariya(): return _login(*ARIYA)


@pytest.fixture(scope="module")
def kabir(): return _login(*KABIR)


@pytest.fixture(scope="module")
def naina(): return _login(*NAINA)


# -------------------- Sanity --------------------
class TestSanity:
    def test_login_all(self, ariya, kabir, naina):
        assert ariya['token'] and kabir['token'] and naina['token']


# -------------------- New endpoints --------------------
class TestConnectionListsShape:
    def test_followers_shape(self, ariya):
        r = requests.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        for item in data:
            assert 'id' in item
            assert 'full_name' in item
            assert 'avatar_url' in item
            assert 'verified' in item
            # tagline / city may be null
            assert 'tagline' in item and 'city' in item

    def test_following_shape(self, ariya):
        r = requests.get(f"{BASE_URL}/api/users/{ariya['user_id']}/following")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


class TestFollowToggleReflectsInLists:
    def test_follow_and_verify_lists(self, ariya, kabir):
        """kabir follows ariya → ariya.followers contains kabir; kabir.following contains ariya."""
        # Ensure clean start: if already following, unfollow first
        r0 = requests.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=_h(kabir['token']))
        assert r0.status_code == 200
        if r0.json().get('following') is False:
            # was already following; toggle again to follow
            r1 = requests.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=_h(kabir['token']))
            assert r1.status_code == 200 and r1.json().get('following') is True
        else:
            assert r0.json().get('following') is True

        try:
            # Verify ariya's followers contains kabir
            rf = requests.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
            assert rf.status_code == 200
            follower_ids = [x['id'] for x in rf.json()]
            assert kabir['user_id'] in follower_ids, follower_ids

            # Verify kabir's following contains ariya
            rf2 = requests.get(f"{BASE_URL}/api/users/{kabir['user_id']}/following")
            assert rf2.status_code == 200
            following_ids = [x['id'] for x in rf2.json()]
            assert ariya['user_id'] in following_ids, following_ids

            # Verify profile.followers count reflects it
            rp = requests.get(f"{BASE_URL}/api/profile/musician/{ariya['user_id']}",
                              headers=_h(ariya['token']))
            assert rp.status_code == 200
            d = rp.json()
            assert 'followers' in d and d['followers'] >= 1
            # NEW: 'following' field present
            assert 'following' in d, f"'following' missing from profile: {list(d.keys())}"
            assert isinstance(d['following'], int)
        finally:
            # Toggle off to leave clean state
            r_off = requests.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=_h(kabir['token']))
            assert r_off.status_code == 200
            # After unfollow, should not be in list
            rf3 = requests.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
            assert kabir['user_id'] not in [x['id'] for x in rf3.json()]

    def test_cannot_follow_self(self, ariya):
        r = requests.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=_h(ariya['token']))
        assert r.status_code == 400

    def test_order_most_recent_first(self, ariya, kabir, naina):
        """kabir then naina follow ariya → ariya.followers[0] should be naina (most recent first)."""
        # Reset any existing state
        for follower in (kabir, naina):
            # Toggle until unfollowed
            r = requests.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
            ids = [x['id'] for x in r.json()]
            if follower['user_id'] in ids:
                requests.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=_h(follower['token']))

        try:
            r1 = requests.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=_h(kabir['token']))
            assert r1.status_code == 200 and r1.json()['following'] is True
            import time; time.sleep(1.1)  # ensure created_at differs
            r2 = requests.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=_h(naina['token']))
            assert r2.status_code == 200 and r2.json()['following'] is True

            rf = requests.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
            ids = [x['id'] for x in rf.json()]
            assert kabir['user_id'] in ids and naina['user_id'] in ids
            # Most recent first: naina should come before kabir
            assert ids.index(naina['user_id']) < ids.index(kabir['user_id']), ids
        finally:
            for follower in (kabir, naina):
                r = requests.get(f"{BASE_URL}/api/users/{ariya['user_id']}/followers")
                ids = [x['id'] for x in r.json()]
                if follower['user_id'] in ids:
                    requests.post(f"{BASE_URL}/api/follow/{ariya['user_id']}", headers=_h(follower['token']))


# -------------------- Regression: iteration 5 endpoints --------------------
class TestIteration5Regression:
    def test_post_comment_and_delete(self, ariya, kabir):
        # ariya creates post
        rp = requests.post(f"{BASE_URL}/api/posts", json={"text": "TEST_iter6_regression"},
                           headers=_h(ariya['token']))
        assert rp.status_code == 200
        pid = rp.json()['id']
        try:
            rc = requests.post(f"{BASE_URL}/api/posts/comment",
                               json={"post_id": pid, "text": "TEST_reg_comment"},
                               headers=_h(kabir['token']))
            assert rc.status_code == 200, rc.text
            cid = rc.json()['id']
            # author deletes
            rd = requests.delete(f"{BASE_URL}/api/comments/{cid}", headers=_h(kabir['token']))
            assert rd.status_code == 200
        finally:
            requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_h(ariya['token']))

    def test_patch_post(self, ariya):
        rp = requests.post(f"{BASE_URL}/api/posts", json={"text": "TEST_iter6_patch"},
                           headers=_h(ariya['token']))
        pid = rp.json()['id']
        try:
            rr = requests.patch(f"{BASE_URL}/api/posts/{pid}", json={"text": "TEST_iter6_patched"},
                                headers=_h(ariya['token']))
            assert rr.status_code == 200
            assert rr.json()['text'] == "TEST_iter6_patched"
        finally:
            requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_h(ariya['token']))

    def test_discover_endpoints_ok(self):
        for ent in ("musicians", "bands", "studios", "equipment", "lessons", "gigs"):
            r = requests.get(f"{BASE_URL}/api/{ent}")
            assert r.status_code == 200, f"{ent}: {r.status_code} {r.text}"
            assert isinstance(r.json(), list)


# -------------------- Hardcoded data spot-check (band with default cover) --------------------
class TestBandCreationHardcodedCleanup:
    def test_create_band_uses_default_cover(self, ariya):
        """When frontend creates a band without cover, it sends DEFAULT_COVERS.band.
        We simulate by NOT sending cover — backend must accept it."""
        payload = {"name": "TEST_iter6_band_default", "genres": ["Jazz"], "city": "Mumbai"}
        r = requests.post(f"{BASE_URL}/api/bands", json=payload, headers=_h(ariya['token']))
        assert r.status_code == 200, r.text
        bid = r.json()['id']
        try:
            # verify appears in entities/mine
            re = requests.get(f"{BASE_URL}/api/entities/mine", headers=_h(ariya['token']))
            assert re.status_code == 200
            band_ids = [b['id'] for b in re.json().get('bands', [])]
            assert bid in band_ids
        finally:
            requests.delete(f"{BASE_URL}/api/bands/{bid}", headers=_h(ariya['token']))
