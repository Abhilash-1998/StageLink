"""
gigZee Iteration 9 — Unified `/api/profile/{userId}` endpoint tests.
Covers:
  1. Anonymous viewer -> can_edit false, is_self false, viewer_id null
  2. Owner bearer -> can_edit/can_open_settings/can_delete_content true; can_follow false
  3. Other logged-in musician bearer -> can_edit false, can_follow/can_message/can_report true
  4. Organizer viewer -> can_hire true
  5. Full payload shape validation
  6. Post visibility filter (private post hidden from non-owner, visible to owner)
  7. Regression: legacy /profile/musician/{id} and /users/{uid}/entities still work.

No seed/demo accounts — aliases musician_a/musician_b/organizer_a.
"""
import pytest
from conftest import BASE_URL


@pytest.fixture(scope="module")
def ariya(musician_a):
    return musician_a


@pytest.fixture(scope="module")
def kabir(musician_b):
    return musician_b


@pytest.fixture(scope="module")
def sunset(organizer_a):
    return organizer_a


# ---------- 1. Unauthenticated ----------
class TestUnifiedProfileAnonymous:
    def test_unauth_returns_200_and_no_edit_perm(self, api_client, ariya):
        r = api_client.get(f"{BASE_URL}/api/profile/{ariya['id']}")
        assert r.status_code == 200, r.text
        body = r.json()
        perms = body.get("permissions", {})
        vr = body.get("viewer_relationship", {})
        assert perms.get("can_edit") is False
        assert perms.get("can_follow") is False
        assert perms.get("can_message") is False
        assert perms.get("can_report") is False
        assert perms.get("can_hire") is False
        assert perms.get("can_share") is True
        assert vr.get("is_self") is False
        assert vr.get("viewer_id") is None


# ---------- 2. Owner bearer ----------
class TestUnifiedProfileOwner:
    def test_owner_perms(self, api_client, ariya):
        r = api_client.get(f"{BASE_URL}/api/profile/{ariya['id']}", headers=ariya["h"])
        assert r.status_code == 200, r.text
        body = r.json()
        perms = body["permissions"]
        vr = body["viewer_relationship"]
        assert perms["can_edit"] is True
        assert perms["can_open_settings"] is True
        assert perms["can_delete_content"] is True
        assert perms["can_create_post"] is True
        assert perms["can_view_analytics"] is True
        assert perms["can_follow"] is False
        assert perms["can_message"] is False
        assert perms["can_hire"] is False
        assert perms["can_report"] is False
        assert vr["is_self"] is True
        assert vr["viewer_id"] == ariya["id"]


# ---------- 3. Different logged-in user ----------
class TestUnifiedProfileOtherViewer:
    def test_other_musician_perms(self, api_client, ariya, kabir):
        r = api_client.get(f"{BASE_URL}/api/profile/{ariya['id']}", headers=kabir["h"])
        assert r.status_code == 200, r.text
        body = r.json()
        perms = body["permissions"]
        vr = body["viewer_relationship"]
        assert perms["can_edit"] is False
        assert perms["can_follow"] is True
        assert perms["can_message"] is True
        assert perms["can_report"] is True
        # make_musician gives both roles so can_hire may be True.
        # can_hire correctness is asserted separately in TestUnifiedProfileOrganizerViewer.
        assert isinstance(perms["can_hire"], bool)
        assert perms["can_delete_content"] is False
        assert vr["is_self"] is False
        assert vr["viewer_id"] == kabir["id"]
        assert isinstance(vr["is_following"], bool)


# ---------- 4. Organizer viewer -> can_hire ----------
class TestUnifiedProfileOrganizerViewer:
    def test_organizer_can_hire(self, api_client, ariya, sunset):
        assert "organizer" in (sunset["user"].get("roles") or []), \
            f"sunset roles={sunset['user'].get('roles')}"
        r = api_client.get(f"{BASE_URL}/api/profile/{ariya['id']}", headers=sunset["h"])
        assert r.status_code == 200, r.text
        perms = r.json()["permissions"]
        assert perms["can_hire"] is True
        assert perms["can_edit"] is False
        assert perms["can_follow"] is True


# ---------- 5. Payload shape ----------
class TestUnifiedProfileShape:
    def test_full_shape(self, api_client, ariya):
        body = api_client.get(f"{BASE_URL}/api/profile/{ariya['id']}").json()
        for k in ("user", "profile", "stats", "entities", "reviews",
                  "upcoming_events", "achievements", "community_activity",
                  "permissions", "viewer_relationship"):
            assert k in body, f"missing top-level key {k}"

        for k in ("followers", "following", "completed_gigs",
                  "reviews_count", "rating", "reliability"):
            assert k in body["stats"], f"missing stats key {k}"

        for k in ("posts", "gigs", "bands", "equipment", "studios", "lessons"):
            assert k in body["entities"], f"missing entities key {k}"
            assert isinstance(body["entities"][k], list), f"{k} not list"

        assert isinstance(body["reviews"], list)
        assert isinstance(body["upcoming_events"], list)
        assert isinstance(body["achievements"], list)

        ca = body["community_activity"]
        for k in ("posts_count", "likes_given", "comments_given",
                  "likes_received", "comments_received"):
            assert k in ca, f"missing community_activity.{k}"
            assert isinstance(ca[k], int)


# ---------- 6. Post visibility filter ----------
class TestPostVisibilityFilter:
    def test_private_post_hidden_from_non_owner(self, api_client, ariya, kabir):
        priv = api_client.post(f"{BASE_URL}/api/posts", headers=ariya["h"],
                               json={"text": "TEST_iter9_private", "visibility": "private"})
        pub = api_client.post(f"{BASE_URL}/api/posts", headers=ariya["h"],
                              json={"text": "TEST_iter9_public", "visibility": "public"})
        assert priv.status_code in (200, 201), priv.text
        assert pub.status_code in (200, 201), pub.text
        priv_id = priv.json().get("id")
        pub_id = pub.json().get("id")
        try:
            as_kabir = api_client.get(f"{BASE_URL}/api/profile/{ariya['id']}",
                                      headers=kabir["h"]).json()
            posts = as_kabir["entities"]["posts"]
            ids = [p.get("id") for p in posts]
            assert pub_id in ids, "public post missing for non-owner"
            assert priv_id not in ids, "private post leaked to non-owner"

            as_owner = api_client.get(f"{BASE_URL}/api/profile/{ariya['id']}",
                                      headers=ariya["h"]).json()
            owner_ids = [p.get("id") for p in as_owner["entities"]["posts"]]
            assert priv_id in owner_ids, "private post missing from owner view"
            assert pub_id in owner_ids
        finally:
            if priv_id:
                api_client.delete(f"{BASE_URL}/api/posts/{priv_id}", headers=ariya["h"])
            if pub_id:
                api_client.delete(f"{BASE_URL}/api/posts/{pub_id}", headers=ariya["h"])


# ---------- 7. Regression: legacy endpoints still work ----------
class TestLegacyEndpoints:
    def test_musician_endpoint_still_200(self, api_client, ariya):
        r = api_client.get(f"{BASE_URL}/api/profile/musician/{ariya['id']}")
        assert r.status_code == 200, r.text

    def test_users_entities_still_200(self, api_client, ariya):
        r = api_client.get(f"{BASE_URL}/api/users/{ariya['id']}/entities")
        assert r.status_code == 200
        body = r.json()
        for k in ("gigs", "bands", "equipment", "studios", "lessons", "posts"):
            assert k in body

    def test_followers_following(self, api_client, ariya):
        assert api_client.get(f"{BASE_URL}/api/users/{ariya['id']}/followers").status_code == 200
        assert api_client.get(f"{BASE_URL}/api/users/{ariya['id']}/following").status_code == 200


# ---------- 8. 404 for unknown user ----------
class TestUnknownUser:
    def test_404_on_missing(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/profile/nonexistent-uid-iter9")
        assert r.status_code == 404
