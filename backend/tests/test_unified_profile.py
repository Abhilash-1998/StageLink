"""
gigZee Iteration 7 — Unified Profile tests.
Creates users via make_musician (no demo seed accounts).
"""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

from conftest import BASE_URL, make_musician


@pytest.fixture(scope="module")
def ariya(api_client):
    u = make_musician(api_client, "Unified Profile A")
    return {"token": u["token"], "id": u["id"], "h": u["h"]}


@pytest.fixture(scope="module")
def kabir(api_client):
    u = make_musician(api_client, "Unified Profile B")
    return {"token": u["token"], "id": u["id"], "h": u["h"]}


# ---------- 1. NEW: /users/{uid}/entities public read ----------
class TestUsersEntities:
    def test_returns_all_expected_arrays_unauth(self, ariya):
        # unauth call — public read
        r = requests.get(f"{BASE_URL}/api/users/{ariya['id']}/entities")
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("gigs", "bands", "equipment", "studios", "lessons", "posts"):
            assert key in body, f"missing key {key}"
            assert isinstance(body[key], list), f"{key} not a list: {type(body[key])}"

    def test_shape_matches_entities_mine(self, ariya):
        pub = requests.get(f"{BASE_URL}/api/users/{ariya['id']}/entities").json()
        mine = requests.get(f"{BASE_URL}/api/entities/mine", headers=ariya["h"]).json()
        assert set(pub.keys()) == set(mine.keys()), f"pub={pub.keys()} mine={mine.keys()}"

    def test_posts_only_include_public_visibility(self, ariya):
        # Create one public + one private post (if visibility supported), then check filter
        pub_post = requests.post(f"{BASE_URL}/api/posts",
                                 headers=ariya["h"],
                                 json={"text": "TEST_public post", "visibility": "public"})
        priv_post = requests.post(f"{BASE_URL}/api/posts",
                                  headers=ariya["h"],
                                  json={"text": "TEST_private post", "visibility": "private"})
        assert pub_post.status_code in (200, 201), pub_post.text
        pub_id = pub_post.json().get("id")
        priv_id = priv_post.json().get("id") if priv_post.status_code in (200, 201) else None
        try:
            r = requests.get(f"{BASE_URL}/api/users/{ariya['id']}/entities")
            posts = r.json().get("posts", [])
            ids = [p.get("id") for p in posts]
            assert pub_id in ids, f"public post not in list: {ids}"
            visibilities = {p.get("visibility") for p in posts}
            assert "private" not in visibilities, f"private visibility leaked: {visibilities}"
            if priv_id:
                assert priv_id not in ids, f"private post leaked: {priv_id} in {ids}"
        finally:
            if pub_id:
                requests.delete(f"{BASE_URL}/api/posts/{pub_id}", headers=ariya["h"])
            if priv_id:
                requests.delete(f"{BASE_URL}/api/posts/{priv_id}", headers=ariya["h"])

    def test_unknown_user_returns_empty(self):
        r = requests.get(f"{BASE_URL}/api/users/nonexistent-uid-xyz/entities")
        assert r.status_code == 200
        body = r.json()
        for k in ("gigs", "bands", "equipment", "studios", "lessons", "posts"):
            assert body[k] == []


# ---------- 2. Regression: /entities/mine still works ----------
class TestEntitiesMine:
    def test_auth_required(self):
        r = requests.get(f"{BASE_URL}/api/entities/mine")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_authed_returns_arrays(self, ariya):
        r = requests.get(f"{BASE_URL}/api/entities/mine", headers=ariya["h"])
        assert r.status_code == 200
        body = r.json()
        for k in ("gigs", "bands", "equipment", "studios", "lessons", "posts"):
            assert isinstance(body.get(k), list)


# ---------- 3. Regression: followers / following ----------
class TestFollowersFollowing:
    def test_followers_list(self, ariya):
        r = requests.get(f"{BASE_URL}/api/users/{ariya['id']}/followers")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_following_list(self, ariya):
        r = requests.get(f"{BASE_URL}/api/users/{ariya['id']}/following")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_follow_toggle(self, ariya, kabir):
        # Kabir follows Ariya, then unfollows
        r1 = requests.post(f"{BASE_URL}/api/follow/{ariya['id']}", headers=kabir["h"])
        assert r1.status_code in (200, 201), r1.text
        following_after = r1.json().get("following")
        # verify list reflects it
        followers = requests.get(f"{BASE_URL}/api/users/{ariya['id']}/followers").json()
        ids = [f.get("id") for f in followers]
        if following_after:
            assert kabir["id"] in ids
        # toggle back
        r2 = requests.post(f"{BASE_URL}/api/follow/{ariya['id']}", headers=kabir["h"])
        assert r2.status_code in (200, 201)


# ---------- 4. Regression: post CRUD ----------
class TestPostCRUD:
    def test_create_get_delete_post(self, ariya):
        create = requests.post(f"{BASE_URL}/api/posts", headers=ariya["h"],
                               json={"text": "TEST_regression_post"})
        assert create.status_code in (200, 201), create.text
        pid = create.json().get("id")
        assert pid
        # verify appears in feed or user entities
        ents = requests.get(f"{BASE_URL}/api/users/{ariya['id']}/entities").json()
        assert any(p.get("id") == pid for p in ents.get("posts", []))
        # delete
        d = requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=ariya["h"])
        assert d.status_code in (200, 204), d.text
        # verify gone
        ents2 = requests.get(f"{BASE_URL}/api/users/{ariya['id']}/entities").json()
        assert not any(p.get("id") == pid for p in ents2.get("posts", []))


# ---------- 5. Regression: comment CRUD ----------
class TestCommentCRUD:
    def test_add_and_delete_comment(self, ariya, kabir):
        post = requests.post(f"{BASE_URL}/api/posts", headers=ariya["h"],
                             json={"text": "TEST_comment_target"})
        pid = post.json().get("id")
        assert pid
        try:
            add = requests.post(f"{BASE_URL}/api/posts/comment",
                                headers=kabir["h"], json={"post_id": pid, "text": "TEST_comment"})
            assert add.status_code in (200, 201), add.text
            cid = add.json().get("id")
            # comments returned inline via GET /posts/{pid}
            listing = requests.get(f"{BASE_URL}/api/posts/{pid}", headers=kabir["h"])
            assert listing.status_code == 200
            comments = listing.json().get("comments", [])
            assert any(c.get("id") == cid for c in comments)
            # delete comment by author
            d = requests.delete(f"{BASE_URL}/api/comments/{cid}", headers=kabir["h"])
            assert d.status_code in (200, 204), d.text
        finally:
            requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=ariya["h"])


# ---------- 6. Regression: entity DELETE (gigs) ----------
class TestEntityDelete:
    def test_create_delete_gig(self, ariya):
        # try as musician; if endpoint requires organizer role, skip
        payload = {
            "title": "TEST_gig_iter7", "description": "test", "city": "Hyderabad",
            "date": "2026-06-01", "budget": 5000, "genres": ["Jazz"],
        }
        r = requests.post(f"{BASE_URL}/api/gigs", headers=ariya["h"], json=payload)
        if r.status_code not in (200, 201):
            pytest.skip(f"Cannot create gig as musician: {r.status_code} {r.text[:120]}")
        gid = r.json().get("id")
        d = requests.delete(f"{BASE_URL}/api/gigs/{gid}", headers=ariya["h"])
        assert d.status_code in (200, 204), d.text
