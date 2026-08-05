"""gigZee Auth Audit — validates full auth/session/role flow.

Covers:
- POST /api/auth/register (validation, dup, tokens+user)
- POST /api/auth/login (register-then-login, invalid, bruteforce lock)
- POST /api/auth/refresh (valid + invalid)
- GET  /api/auth/me (valid, missing, malformed)
- POST /api/auth/logout
- POST /api/auth/roles (musician / both)
- POST /api/auth/active-role (not-in-roles, not-onboarded, valid)

No seed/demo accounts — tests register their own users.
"""
import uuid
import pytest
from conftest import BASE_URL, make_musician, make_organizer, register_user


# ---------------- helpers ----------------
def _register(api, email=None, password="TestPass1", full_name="TEST User"):
    email = email or f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = api.post(f"{BASE_URL}/api/auth/register",
                 json={"email": email, "password": password, "full_name": full_name})
    return r, email


def _headers(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- Health ----------------
class TestHealth:
    def test_root(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("app") == "gigZee API"


# ---------------- Register ----------------
class TestRegister:
    def test_register_success(self, api_client):
        r, email = _register(api_client)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("access_token") and j.get("refresh_token")
        u = j["user"]
        assert u["email"].lower() == email.lower()
        assert u["roles"] == []
        assert u["active_role"] is None
        assert u["onboarded"] is False

    def test_register_invalid_email(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/register",
                            json={"email": "not-an-email", "password": "TestPass1", "full_name": "X Y"})
        assert r.status_code == 422

    def test_register_weak_password_too_short(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/register",
                            json={"email": f"test_{uuid.uuid4().hex[:6]}@example.com",
                                  "password": "abc12", "full_name": "X Y"})
        assert r.status_code == 422

    def test_register_password_needs_letters_and_numbers(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/register",
                            json={"email": f"test_{uuid.uuid4().hex[:6]}@example.com",
                                  "password": "onlyletters", "full_name": "X Y"})
        assert r.status_code == 422

    def test_register_duplicate_email(self, api_client):
        r1, email = _register(api_client)
        assert r1.status_code == 200
        r2, _ = _register(api_client, email=email)
        assert r2.status_code == 400
        assert "already" in r2.json().get("detail", "").lower()


# ---------------- Login ----------------
class TestLogin:
    def test_login_registered_musician(self, api_client):
        m = make_musician(api_client, "Login Musician")
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": m["email"], "password": m["password"]})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["access_token"] and j["refresh_token"]
        u = j["user"]
        assert u["email"] == m["email"]
        assert "musician" in u["roles"]
        assert u["active_role"] == "musician"
        assert u["onboarded"] is True

    def test_login_registered_organizer(self, api_client):
        o = make_organizer(api_client, "Login Organizer")
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": o["email"], "password": o["password"]})
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert "organizer" in u["roles"] and u["active_role"] == "organizer"

    def test_login_invalid_password(self, api_client):
        u = register_user(api_client)
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": u["email"], "password": "wrongPass9"})
        assert r.status_code == 401
        assert r.json().get("detail") == "Invalid email or password"

    def test_login_unknown_email(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/login",
                            json={"email": f"ghost_{uuid.uuid4().hex[:6]}@example.com", "password": "wrongPass9"})
        assert r.status_code == 401

    def test_login_bruteforce_lock(self, api_client):
        # dedicated fresh user; hammer 6 wrong tries -> 7th should 429
        _, email = _register(api_client, password="RealPass1")
        for i in range(6):
            r = api_client.post(f"{BASE_URL}/api/auth/login",
                                json={"email": email, "password": "WrongPw9"})
            assert r.status_code == 401, f"Attempt {i}: {r.status_code} {r.text}"
        r7 = api_client.post(f"{BASE_URL}/api/auth/login",
                             json={"email": email, "password": "WrongPw9"})
        assert r7.status_code == 429, f"Expected 429 after 6 fails, got {r7.status_code}: {r7.text}"
        # even correct password should still be locked
        r8 = api_client.post(f"{BASE_URL}/api/auth/login",
                             json={"email": email, "password": "RealPass1"})
        assert r8.status_code == 429


# ---------------- Refresh ----------------
class TestRefresh:
    def test_refresh_valid(self, api_client):
        u = register_user(api_client)
        login = api_client.post(f"{BASE_URL}/api/auth/login",
                                json={"email": u["email"], "password": u["password"]}).json()
        rt = login["refresh_token"]
        r = api_client.post(f"{BASE_URL}/api/auth/refresh", json={"refresh_token": rt})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["access_token"] and j["refresh_token"]
        assert j["user"]["email"] == u["email"]
        # new access token should be usable on /me
        me = api_client.get(f"{BASE_URL}/api/auth/me", headers=_headers(j["access_token"]))
        assert me.status_code == 200

    def test_refresh_invalid_token(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/refresh", json={"refresh_token": "not.a.valid.jwt"})
        assert r.status_code == 401

    def test_refresh_wrong_token_type(self, api_client):
        # pass access token where refresh expected
        u = register_user(api_client)
        login = api_client.post(f"{BASE_URL}/api/auth/login",
                                json={"email": u["email"], "password": u["password"]}).json()
        r = api_client.post(f"{BASE_URL}/api/auth/refresh", json={"refresh_token": login["access_token"]})
        assert r.status_code == 401


# ---------------- Me ----------------
class TestMe:
    def test_me_valid(self, api_client):
        m = make_musician(api_client, "Me Musician")
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers=_headers(m["token"]))
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == m["email"]
        assert "musician" in u["roles"]

    def test_me_missing_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code in (401, 403)  # HTTPBearer(auto_error=False) -> 401

    def test_me_malformed_token(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me", headers=_headers("garbage.token.value"))
        assert r.status_code == 401


# ---------------- Logout ----------------
class TestLogout:
    def test_logout_ok(self, api_client):
        o = make_organizer(api_client, "Logout Org")
        r = api_client.post(f"{BASE_URL}/api/auth/logout", headers=_headers(o["token"]))
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_logout_missing_token(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/auth/logout")
        assert r.status_code == 401


# ---------------- Roles ----------------
class TestRoles:
    def test_set_single_role_musician(self, api_client):
        r, _ = _register(api_client)
        tok = r.json()["access_token"]
        rr = api_client.post(f"{BASE_URL}/api/auth/roles", json={"roles": ["musician"]}, headers=_headers(tok))
        assert rr.status_code == 200, rr.text
        u = rr.json()
        assert u["roles"] == ["musician"]
        assert u["active_role"] == "musician"

    def test_set_both_roles(self, api_client):
        r, _ = _register(api_client)
        tok = r.json()["access_token"]
        rr = api_client.post(f"{BASE_URL}/api/auth/roles",
                             json={"roles": ["musician", "organizer"]}, headers=_headers(tok))
        assert rr.status_code == 200
        u = rr.json()
        assert set(u["roles"]) == {"musician", "organizer"}
        assert u["active_role"] in ("musician", "organizer")

    def test_active_role_auto_adds_missing_role(self, api_client):
        """Action-based model: switching active_role adds it to roles if missing."""
        r, _ = _register(api_client)
        tok = r.json()["access_token"]
        api_client.post(f"{BASE_URL}/api/auth/roles",
                        json={"roles": ["musician"]}, headers=_headers(tok))
        rr = api_client.post(f"{BASE_URL}/api/auth/active-role",
                             json={"active_role": "organizer"}, headers=_headers(tok))
        assert rr.status_code == 200, rr.text
        u = rr.json()
        assert "organizer" in u["roles"]
        assert u["active_role"] == "organizer"

    def test_active_role_works_before_onboarding(self, api_client):
        """Active role can be set before profile onboarding (action-based)."""
        r, _ = _register(api_client)
        tok = r.json()["access_token"]
        api_client.post(f"{BASE_URL}/api/auth/roles",
                        json={"roles": ["musician", "organizer"]}, headers=_headers(tok))
        rr = api_client.post(f"{BASE_URL}/api/auth/active-role",
                             json={"active_role": "organizer"}, headers=_headers(tok))
        assert rr.status_code == 200, rr.text
        assert rr.json()["active_role"] == "organizer"

    def test_active_role_accepts_after_onboarding(self, api_client):
        # onboarded musician can set active_role to musician
        m = make_musician(api_client, "Active Role Musician")
        rr = api_client.post(f"{BASE_URL}/api/auth/active-role",
                             json={"active_role": "musician"}, headers=_headers(m["token"]))
        assert rr.status_code == 200
        assert rr.json()["active_role"] == "musician"
