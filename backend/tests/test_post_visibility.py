"""
StageLink Iteration 8 — Post visibility hygiene tests.
Covers the PostIn/PostUpdate `visibility` field fix.

Verifies:
 1. Creating public/followers/private posts persists visibility
 2. Missing visibility defaults to 'public'
 3. Invalid visibility -> 422
 4. /users/{uid}/entities filters non-public posts
 5. PATCH /posts/{pid} can flip visibility -> non-public post disappears
"""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / 'frontend' / '.env')
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')

ARIYA = ("ariya.kapoor@stagelink.dev", "demo1234")


def _login(email, pwd):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pwd})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    uid = (body.get("user") or {}).get("id")
    assert tok and uid, f"Missing token/user in {body}"
    return tok, uid


@pytest.fixture(scope="module")
def ariya():
    tok, uid = _login(*ARIYA)
    return {
        "token": tok,
        "id": uid,
        "h": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
    }


@pytest.fixture(autouse=True)
def _track_and_cleanup(request, ariya):
    """Track posts created during a test and delete them at the end."""
    created = []
    request.node._created_posts = created  # noqa: SLF001
    yield
    for pid in created:
        try:
            requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=ariya["h"])
        except Exception:
            pass


def _create_post(node, ariya, body):
    r = requests.post(f"{BASE_URL}/api/posts", headers=ariya["h"], json=body)
    if r.status_code in (200, 201):
        pid = r.json().get("id")
        if pid:
            node._created_posts.append(pid)  # noqa: SLF001
    return r


# ---------- 1. Visibility on create ----------
class TestPostCreateVisibility:
    def test_create_private_post(self, request, ariya):
        r = _create_post(request.node, ariya, {"text": "TEST_private", "visibility": "private"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("visibility") == "private", f"expected private, got {body.get('visibility')}"
        assert body.get("text") == "TEST_private"
        assert body.get("id")

    def test_create_public_default(self, request, ariya):
        r = _create_post(request.node, ariya, {"text": "TEST_public_default"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("visibility") == "public", f"expected public default, got {body.get('visibility')}"

    def test_create_followers_post(self, request, ariya):
        r = _create_post(request.node, ariya, {"text": "TEST_followers", "visibility": "followers"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("visibility") == "followers", f"expected followers, got {body.get('visibility')}"

    def test_create_invalid_visibility_422(self, request, ariya):
        r = _create_post(request.node, ariya, {"text": "TEST_bad", "visibility": "invalid"})
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"


# ---------- 2. /users/{uid}/entities filter ----------
class TestUserEntitiesVisibilityFilter:
    def test_only_public_posts_leak_through(self, request, ariya):
        pub = _create_post(request.node, ariya, {"text": "TEST_leak_pub", "visibility": "public"})
        priv = _create_post(request.node, ariya, {"text": "TEST_leak_priv", "visibility": "private"})
        foll = _create_post(request.node, ariya, {"text": "TEST_leak_foll", "visibility": "followers"})
        assert pub.status_code == 200 and priv.status_code == 200 and foll.status_code == 200
        pub_id = pub.json()["id"]
        priv_id = priv.json()["id"]
        foll_id = foll.json()["id"]

        r = requests.get(f"{BASE_URL}/api/users/{ariya['id']}/entities")
        assert r.status_code == 200, r.text
        posts = r.json().get("posts", [])
        ids = [p.get("id") for p in posts]

        assert pub_id in ids, f"public post missing from entities: {ids}"
        assert priv_id not in ids, f"private post LEAKED in entities: {priv_id}"
        assert foll_id not in ids, f"followers post LEAKED in entities: {foll_id}"

        # Also assert none of the returned posts has visibility != 'public' (when present)
        for p in posts:
            v = p.get("visibility")
            assert v in (None, "public"), f"non-public visibility leaked: {p.get('id')} -> {v}"


# ---------- 3. PATCH visibility flip ----------
class TestPatchVisibility:
    def test_flip_public_to_private_removes_from_entities(self, request, ariya):
        # create public post
        create = _create_post(request.node, ariya, {"text": "TEST_flip", "visibility": "public"})
        assert create.status_code == 200, create.text
        pid = create.json()["id"]

        # confirm it appears in entities
        ents = requests.get(f"{BASE_URL}/api/users/{ariya['id']}/entities").json()
        assert any(p.get("id") == pid for p in ents.get("posts", [])), "public post not initially visible"

        # PATCH to private
        patch = requests.patch(f"{BASE_URL}/api/posts/{pid}", headers=ariya["h"],
                               json={"visibility": "private"})
        assert patch.status_code == 200, patch.text
        assert patch.json().get("visibility") == "private", f"visibility not updated: {patch.json()}"

        # confirm removed
        ents2 = requests.get(f"{BASE_URL}/api/users/{ariya['id']}/entities").json()
        assert not any(p.get("id") == pid for p in ents2.get("posts", [])), \
            f"private post still leaked after PATCH: {pid}"

    def test_patch_invalid_visibility_422(self, request, ariya):
        create = _create_post(request.node, ariya, {"text": "TEST_patch_bad"})
        assert create.status_code == 200
        pid = create.json()["id"]
        r = requests.patch(f"{BASE_URL}/api/posts/{pid}", headers=ariya["h"],
                           json={"visibility": "nonsense"})
        assert r.status_code == 422, f"expected 422 on bad visibility PATCH, got {r.status_code}: {r.text[:200]}"
