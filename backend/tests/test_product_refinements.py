"""
Iteration 4 backend tests — Product refinements v1
Creates its own users via make_musician / make_organizer (no demo seed accounts).
"""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

from conftest import BASE_URL, make_musician, make_organizer


def _headers(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def ariya(api_client):
    u = make_musician(api_client, "Refinement Musician A")
    return {"token": u["token"], "user_id": u["id"], "user": u["user"], "h": u["h"]}


@pytest.fixture(scope="module")
def kabir(api_client):
    u = make_musician(api_client, "Refinement Musician B")
    return {"token": u["token"], "user_id": u["id"], "user": u["user"], "h": u["h"]}


@pytest.fixture(scope="module")
def sunset(api_client):
    u = make_organizer(api_client, "Refinement Organizer")
    return {"token": u["token"], "user_id": u["id"], "user": u["user"], "h": u["h"]}


# ---------- SANITY ----------
class TestSanity:
    def test_login_ariya(self, ariya):
        assert ariya['token']
        assert ariya['user_id']


# ---------- POSTS ----------
class TestPostCRUD:
    def test_create_and_edit_and_delete_post(self, ariya):
        # create
        r = requests.post(f"{BASE_URL}/api/posts",
                          json={"text": "TEST_post original"},
                          headers=_headers(ariya['token']))
        assert r.status_code == 200, r.text
        p = r.json()
        assert p['text'] == "TEST_post original"
        pid = p['id']

        # edit (owner)
        r = requests.patch(f"{BASE_URL}/api/posts/{pid}",
                           json={"text": "TEST_post edited"},
                           headers=_headers(ariya['token']))
        assert r.status_code == 200, r.text
        assert r.json()['text'] == "TEST_post edited"

        # GET to verify persistence
        r = requests.get(f"{BASE_URL}/api/posts/{pid}", headers=_headers(ariya['token']))
        assert r.status_code == 200
        assert r.json()['post']['text'] == "TEST_post edited"

        # delete (owner)
        r = requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_headers(ariya['token']))
        assert r.status_code == 200
        assert r.json().get('deleted') is True

        # verify 404 after delete
        r = requests.get(f"{BASE_URL}/api/posts/{pid}", headers=_headers(ariya['token']))
        assert r.status_code == 404

    def test_edit_post_non_owner_403(self, ariya, kabir):
        r = requests.post(f"{BASE_URL}/api/posts",
                          json={"text": "TEST_post_403_edit"},
                          headers=_headers(ariya['token']))
        assert r.status_code == 200
        pid = r.json()['id']
        try:
            r = requests.patch(f"{BASE_URL}/api/posts/{pid}",
                               json={"text": "hack"},
                               headers=_headers(kabir['token']))
            assert r.status_code == 403, r.text
        finally:
            requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_headers(ariya['token']))

    def test_edit_post_nonexistent_404(self, ariya):
        r = requests.patch(f"{BASE_URL}/api/posts/does-not-exist",
                           json={"text": "x"},
                           headers=_headers(ariya['token']))
        assert r.status_code == 404

    def test_delete_post_non_owner_403(self, ariya, kabir):
        r = requests.post(f"{BASE_URL}/api/posts",
                          json={"text": "TEST_post_403_del"},
                          headers=_headers(ariya['token']))
        assert r.status_code == 200
        pid = r.json()['id']
        try:
            r = requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_headers(kabir['token']))
            assert r.status_code == 403
        finally:
            requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_headers(ariya['token']))

    def test_delete_post_cascades_comments_and_likes(self, ariya, kabir):
        # ariya creates post
        r = requests.post(f"{BASE_URL}/api/posts",
                          json={"text": "TEST_cascade"},
                          headers=_headers(ariya['token']))
        assert r.status_code == 200
        pid = r.json()['id']

        # kabir comments and likes
        rc = requests.post(f"{BASE_URL}/api/posts/comment",
                           json={"post_id": pid, "text": "TEST_comment"},
                           headers=_headers(kabir['token']))
        assert rc.status_code == 200
        cid = rc.json()['id']
        rl = requests.post(f"{BASE_URL}/api/posts/{pid}/like",
                           headers=_headers(kabir['token']))
        assert rl.status_code == 200
        assert rl.json()['liked'] is True

        # delete post
        rd = requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_headers(ariya['token']))
        assert rd.status_code == 200

        # Trying to delete the comment again should give 404 (comment cascaded)
        rc2 = requests.delete(f"{BASE_URL}/api/comments/{cid}", headers=_headers(kabir['token']))
        assert rc2.status_code == 404, f"Comment should be cascade-deleted: {rc2.status_code} {rc2.text}"


# ---------- COMMENTS ----------
class TestCommentDelete:
    def test_delete_comment_updates_count(self, ariya, kabir):
        # ariya creates a post
        r = requests.post(f"{BASE_URL}/api/posts",
                          json={"text": "TEST_comment_count_post"},
                          headers=_headers(ariya['token']))
        pid = r.json()['id']
        try:
            # kabir comments twice
            for i in range(2):
                rc = requests.post(f"{BASE_URL}/api/posts/comment",
                                   json={"post_id": pid, "text": f"TEST_c{i}"},
                                   headers=_headers(kabir['token']))
                assert rc.status_code == 200
            # verify comment_count == 2
            rf = requests.get(f"{BASE_URL}/api/posts/{pid}", headers=_headers(ariya['token']))
            assert rf.json()['post']['comment_count'] == 2
            comments = rf.json()['comments']
            assert len(comments) == 2
            cid = comments[0]['id']

            # non-author cannot delete
            r_nonauthor = requests.delete(f"{BASE_URL}/api/comments/{cid}",
                                          headers=_headers(ariya['token']))
            assert r_nonauthor.status_code == 403

            # author deletes
            rd = requests.delete(f"{BASE_URL}/api/comments/{cid}", headers=_headers(kabir['token']))
            assert rd.status_code == 200

            # verify comment_count decremented
            rf2 = requests.get(f"{BASE_URL}/api/posts/{pid}", headers=_headers(ariya['token']))
            assert rf2.json()['post']['comment_count'] == 1, rf2.json()['post']
        finally:
            requests.delete(f"{BASE_URL}/api/posts/{pid}", headers=_headers(ariya['token']))


# ---------- GIGS ----------
class TestGigDelete:
    def test_organizer_deletes_gig_and_cascades_applications(self, sunset, ariya):
        # sunset creates gig
        payload = {
            "title": "TEST_gig_del",
            "description": "throwaway",
            "city": "Hyderabad",
            "date": "2026-12-01",
            "event_type": "wedding",
            "genre": "Jazz",
            "instrument_needed": "Vocals",
            "budget": 5000,
        }
        r = requests.post(f"{BASE_URL}/api/gigs", json=payload, headers=_headers(sunset['token']))
        assert r.status_code == 200, r.text
        gid = r.json()['id']

        # ariya applies
        ra = requests.post(f"{BASE_URL}/api/applications",
                           json={"gig_id": gid, "message": "TEST_apply"},
                           headers=_headers(ariya['token']))
        assert ra.status_code == 200, ra.text

        # non-organizer cannot delete
        rn = requests.delete(f"{BASE_URL}/api/gigs/{gid}", headers=_headers(ariya['token']))
        assert rn.status_code == 403

        # organizer deletes
        rd = requests.delete(f"{BASE_URL}/api/gigs/{gid}", headers=_headers(sunset['token']))
        assert rd.status_code == 200

        # verify gig 404
        rg = requests.get(f"{BASE_URL}/api/gigs/{gid}")
        assert rg.status_code == 404


# ---------- BANDS / EQUIPMENT / STUDIOS / LESSONS ----------
class TestEntityDeletes:
    def test_delete_band_owner_only(self, ariya, kabir):
        r = requests.post(f"{BASE_URL}/api/bands",
                          json={"name": "TEST_band", "genres": ["Jazz"], "city": "Hyderabad"},
                          headers=_headers(ariya['token']))
        assert r.status_code == 200, r.text
        bid = r.json()['id']
        rn = requests.delete(f"{BASE_URL}/api/bands/{bid}", headers=_headers(kabir['token']))
        assert rn.status_code == 403
        rd = requests.delete(f"{BASE_URL}/api/bands/{bid}", headers=_headers(ariya['token']))
        assert rd.status_code == 200
        # 404 on second delete
        rd2 = requests.delete(f"{BASE_URL}/api/bands/{bid}", headers=_headers(ariya['token']))
        assert rd2.status_code == 404

    def test_delete_equipment_owner_only(self, ariya, kabir):
        r = requests.post(f"{BASE_URL}/api/equipment",
                          json={"title": "TEST_eq", "category": "guitar",
                                "listing_type": "rent", "price": 500, "city": "Hyderabad",
                                "description": "throwaway"},
                          headers=_headers(ariya['token']))
        assert r.status_code == 200, r.text
        eid = r.json()['id']
        rn = requests.delete(f"{BASE_URL}/api/equipment/{eid}", headers=_headers(kabir['token']))
        assert rn.status_code == 403
        rd = requests.delete(f"{BASE_URL}/api/equipment/{eid}", headers=_headers(ariya['token']))
        assert rd.status_code == 200

    def test_delete_studio_owner_only(self, ariya, kabir):
        r = requests.post(f"{BASE_URL}/api/studios",
                          json={"name": "TEST_studio", "city": "Hyderabad",
                                "hourly_rate": 800, "description": "x"},
                          headers=_headers(ariya['token']))
        assert r.status_code == 200, r.text
        sid = r.json()['id']
        rn = requests.delete(f"{BASE_URL}/api/studios/{sid}", headers=_headers(kabir['token']))
        assert rn.status_code == 403
        rd = requests.delete(f"{BASE_URL}/api/studios/{sid}", headers=_headers(ariya['token']))
        assert rd.status_code == 200

    def test_delete_lesson_teacher_only(self, ariya, kabir):
        r = requests.post(f"{BASE_URL}/api/lessons",
                          json={"title": "TEST_lesson", "subject": "Vocals",
                                "city": "Hyderabad", "price_per_hour": 700,
                                "description": "x"},
                          headers=_headers(ariya['token']))
        assert r.status_code == 200, r.text
        lid = r.json()['id']
        rn = requests.delete(f"{BASE_URL}/api/lessons/{lid}", headers=_headers(kabir['token']))
        assert rn.status_code == 403
        rd = requests.delete(f"{BASE_URL}/api/lessons/{lid}", headers=_headers(ariya['token']))
        assert rd.status_code == 200


# ---------- Existing endpoints — sanity ----------
class TestExisting:
    def test_unified_profile(self, ariya):
        r = requests.get(f"{BASE_URL}/api/profile/musician/{ariya['user_id']}",
                         headers=_headers(ariya['token']))
        assert r.status_code == 200, r.text
        data = r.json()
        # unified profile should have user info and profile fields (bio/professions/etc.)
        assert isinstance(data, dict)
        # commonly includes 'user' or profile fields directly
        assert 'user_id' in data or 'user' in data or 'bio' in data

    def test_entities_mine_contains_all_keys(self, ariya):
        r = requests.get(f"{BASE_URL}/api/entities/mine", headers=_headers(ariya['token']))
        assert r.status_code == 200
        d = r.json()
        for key in ('gigs', 'bands', 'equipment', 'studios', 'lessons', 'posts'):
            assert key in d, f"missing {key}"
            assert isinstance(d[key], list)
