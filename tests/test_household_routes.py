"""Tests for the /api/households module (DB layer stubbed).

Mirrors test_expense_routes.py: we bump RATE_LIMIT_PER_MINUTE so the shared
in-memory limiter never trips during the run, then patch the service functions
in the routes namespace (they are statically imported there) so no live MySQL
is needed. Covers the full household lifecycle plus validation / 401 / 403 /
404 / 409 paths.

Identity model under test: the Node backend forwards the authenticated user's
id in the `X-User-Id` header; the Python service trusts it and derives owner
rights from users.household_id + household_members.role.
"""

import os

# Raise the per-IP rate limit before main (and services.limiter) is imported,
# so the in-memory limiter can't return 429 mid-suite.
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "100000")

from fastapi.testclient import TestClient

from services.household_service import HouseholdError

import routes.households as rh
import main


# ───────────────────────── In-memory fake DB ─────────────────────────
class FakeDB:
    def __init__(self):
        self.users = {}        # uid -> {id, email, household_id, name, ...}
        self.households = {}   # hid -> {id, name, description, owner_id, ...}
        self.members = []      # [{id, household_id, user_id, role, joined_at}]
        self.h_seq = 0
        self.m_seq = 0

    # --- db_service.find_user_by_id (caller context) ---
    def find_user_by_id(self, user_id):
        u = self.users.get(user_id)
        if u is None:
            return None
        role = None
        for m in self.members:
            if m["household_id"] == u.get("household_id") and m["user_id"] == user_id:
                role = m["role"]
                break
        return {**u, "household_role": role}

    # --- household_service.create_household (transaction) ---
    def create_household(self, name, description, owner_id):
        self.h_seq += 1
        hid = self.h_seq
        self.households[hid] = {
            "id": hid, "name": name, "description": description,
            "owner_id": owner_id, "is_deleted": 0,
            "created_at": "2026-07-20T00:00:00",
        }
        self.m_seq += 1
        self.members.append({
            "id": self.m_seq, "household_id": hid, "user_id": owner_id,
            "role": "owner", "joined_at": "2026-07-20",
        })
        if owner_id in self.users:
            self.users[owner_id]["household_id"] = hid
        return hid

    def get_household(self, household_id):
        h = self.households.get(household_id)
        if h is None or h["is_deleted"]:
            return None
        owner_email = None
        u = self.users.get(h["owner_id"])
        if u:
            owner_email = u.get("email")
        return {**h, "owner_email": owner_email}

    def get_household_members(self, household_id):
        out = []
        for m in self.members:
            if m["household_id"] == household_id:
                u = self.users.get(m["user_id"], {})
                out.append({
                    "id": m["id"], "user_id": m["user_id"],
                    "email": u.get("email"), "name": u.get("name"),
                    "role": m["role"], "joined_at": m["joined_at"],
                })
        out.sort(key=lambda r: r["joined_at"])
        return out

    def find_households_by_name(self, name):
        out = []
        for h in self.households.values():
            if not h["is_deleted"] and name.lower() in (h["name"] or "").lower():
                owner_email = None
                u = self.users.get(h["owner_id"])
                if u:
                    owner_email = u.get("email")
                out.append({**h, "owner_email": owner_email})
        return out

    def find_user_by_email(self, email):
        for u in self.users.values():
            if u.get("email") == email:
                return {"id": u["id"], "email": u["email"],
                        "household_id": u.get("household_id")}
        return None

    def add_member(self, household_id, user_id, role):
        if role not in ("owner", "parent", "child"):
            raise HouseholdError(f"invalid member role: {role}", 400)
        u = self.users.get(user_id)
        if u is None:
            raise HouseholdError("user not found", 404)
        if u.get("household_id") and u["household_id"] != household_id:
            raise HouseholdError("user already belongs to another household", 400)
        self.m_seq += 1
        self.members.append({
            "id": self.m_seq, "household_id": household_id, "user_id": user_id,
            "role": role, "joined_at": "2026-07-20",
        })
        self.users[user_id]["household_id"] = household_id
        return self.m_seq

    def set_member_role(self, household_id, user_id, role):
        if role not in ("owner", "parent", "child"):
            raise HouseholdError(f"invalid member role: {role}", 400)
        for m in self.members:
            if m["household_id"] == household_id and m["user_id"] == user_id:
                m["role"] = role
                return True
        return False

    def remove_member(self, household_id, user_id):
        for m in self.members:
            if m["household_id"] == household_id and m["user_id"] == user_id:
                if m["role"] == "owner":
                    raise HouseholdError("cannot remove the household owner", 400)
                self.members.remove(m)
                if self.users.get(user_id, {}).get("household_id") == household_id:
                    self.users[user_id]["household_id"] = None
                return
        raise HouseholdError("member not found in household", 404)

    def update_household(self, household_id, name, description):
        h = self.households.get(household_id)
        if h is None or h["is_deleted"]:
            return False
        if name is not None:
            h["name"] = name
        if description is not None:
            h["description"] = description
        return True

    def soft_delete_household(self, household_id):
        h = self.households.get(household_id)
        if h is None or h["is_deleted"]:
            return False
        h["is_deleted"] = 1
        return True


# ───────────────────────── Seed helpers ─────────────────────────
def seed_user(db, uid, email, household_id=None, name=None):
    db.users[uid] = {
        "id": uid, "email": email, "household_id": household_id,
        "name": name, "role_id": 3, "status": 1,
    }


def seed_household(db, hid, name, owner_id, members=None):
    db.households[hid] = {
        "id": hid, "name": name, "description": None,
        "owner_id": owner_id, "is_deleted": 0,
        "created_at": "2026-07-20T00:00:00",
    }
    db.h_seq = max(db.h_seq, hid)
    for (uid, role) in (members or []):
        db.m_seq += 1
        db.members.append({
            "id": db.m_seq, "household_id": hid, "user_id": uid,
            "role": role, "joined_at": "2026-07-20",
        })


def _patch(db):
    rh.create_household = db.create_household
    rh.get_household = db.get_household
    rh.get_household_members = db.get_household_members
    rh.find_households_by_name = db.find_households_by_name
    rh.find_user_by_email = db.find_user_by_email
    rh.add_member = db.add_member
    rh.set_member_role = db.set_member_role
    rh.remove_member = db.remove_member
    rh.update_household = db.update_household
    rh.soft_delete_household = db.soft_delete_household
    rh.find_user_by_id = db.find_user_by_id


def _client(db):
    _patch(db)
    return TestClient(main.app)


H = lambda uid: {"X-User-Id": str(uid)}


# ───────────────────────── Create ─────────────────────────
def test_create_201_returns_household():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com")
    c = _client(db)
    r = c.post("/api/households", json={"name": "Smith", "description": "us"},
               headers=H(1))
    assert r.status_code == 201, r.text
    body = r.json()["detail"]
    assert body["id"] == 1
    assert body["name"] == "Smith"
    assert body["owner_id"] == 1


def test_create_409_if_already_in_household():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=5)
    c = _client(db)
    r = c.post("/api/households", json={"name": "Smith"}, headers=H(1))
    assert r.status_code == 409
    assert "already" in r.json()["detail"].lower()


def test_create_400_missing_name():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com")
    c = _client(db)
    r = c.post("/api/households", json={"name": ""}, headers=H(1))
    assert r.status_code == 400
    assert "name" in r.json()["detail"].lower()


def test_create_401_missing_header():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com")
    c = _client(db)
    r = c.post("/api/households", json={"name": "Smith"})
    assert r.status_code == 401


# ───────────────────────── Get (me / by id / by name) ─────────────────────────
def test_get_me_returns_own_household():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.get("/api/households/me", headers=H(1))
    assert r.status_code == 200
    body = r.json()
    assert body["household"]["id"] == 1
    assert len(body["members"]) == 1


def test_get_me_null_when_none():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com")
    c = _client(db)
    r = c.get("/api/households/me", headers=H(1))
    assert r.status_code == 200
    assert r.json() == {"household": None, "members": []}


def test_get_by_id_200_and_404():
    db = FakeDB()
    seed_household(db, 1, "Smith", owner_id=1)
    c = _client(db)
    assert c.get("/api/households/1").status_code == 200
    assert c.get("/api/households/2").status_code == 404


def test_search_by_name_and_requires_name():
    db = FakeDB()
    seed_household(db, 1, "Smith Family", owner_id=1)
    c = _client(db)
    r = c.get("/api/households?name=smith")
    assert r.status_code == 200
    assert len(r.json()["households"]) == 1
    assert c.get("/api/households").status_code == 400


# ───────────────────────── Add member ─────────────────────────
def test_add_member_200_auto_id():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_user(db, 2, "member@x.com")
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.post("/api/households/1/members", json={"userId": 2, "role": "parent"},
               headers=H(1))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] > 0            # DB-generated member id
    assert body["user_id"] == 2
    assert body["role"] == "parent"
    assert db.users[2]["household_id"] == 1


def test_add_member_403_not_owner():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_user(db, 3, "child@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner"), (3, "child")])
    c = _client(db)
    r = c.post("/api/households/1/members", json={"userId": 2}, headers=H(3))
    assert r.status_code == 403


def test_add_member_400_already_other_household():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_user(db, 2, "member@x.com", household_id=9)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.post("/api/households/1/members", json={"userId": 2}, headers=H(1))
    assert r.status_code == 400
    assert "another household" in r.json()["detail"].lower()


def test_add_member_400_bad_role():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_user(db, 2, "member@x.com")
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.post("/api/households/1/members", json={"userId": 2, "role": "owner"},
               headers=H(1))
    assert r.status_code == 400


# ───────────────────────── Update ─────────────────────────
def test_update_200_and_404():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.put("/api/households/1", json={"name": "New"}, headers=H(1))
    assert r.status_code == 200
    assert r.json()["name"] == "New"
    assert c.put("/api/households/99", json={"name": "X"}, headers=H(1)).status_code == 404


def test_update_400_nothing_to_update():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.put("/api/households/1", json={}, headers=H(1))
    assert r.status_code == 400


# ───────────────────────── Soft delete ─────────────────────────
def test_soft_delete_200_and_404():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.delete("/api/households/1", headers=H(1))
    assert r.status_code == 200
    assert r.json() == {"id": 1, "deleted": True}
    assert c.get("/api/households/1").status_code == 404  # hidden after soft delete
    assert c.delete("/api/households/99", headers=H(1)).status_code == 404


# ───────────────────────── Remove member ─────────────────────────
def test_remove_member_200():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_user(db, 2, "member@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner"), (2, "parent")])
    c = _client(db)
    r = c.delete("/api/households/1/members/2", headers=H(1))
    assert r.status_code == 200
    assert r.json() == {"id": 2, "removed": True}


def test_remove_member_400_owner():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.delete("/api/households/1/members/1", headers=H(1))
    assert r.status_code == 400
    assert "owner" in r.json()["detail"].lower()


def test_remove_member_404_missing():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.delete("/api/households/1/members/99", headers=H(1))
    assert r.status_code == 404


# ───────────────────────── Invite (add by email) ─────────────────────────
def test_invite_200():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_user(db, 2, "member@x.com")
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.post("/api/households/invite", json={"email": "member@x.com", "role": "child"},
               headers=H(1))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "member@x.com"
    assert body["role"] == "child"
    assert db.users[2]["household_id"] == 1


def test_invite_404_unknown_email():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.post("/api/households/invite", json={"email": "nobody@x.com"}, headers=H(1))
    assert r.status_code == 404


def test_invite_400_already_other_household():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_user(db, 2, "member@x.com", household_id=9)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner")])
    c = _client(db)
    r = c.post("/api/households/invite", json={"email": "member@x.com"}, headers=H(1))
    assert r.status_code == 400


def test_invite_403_not_owner():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_user(db, 3, "child@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner"), (3, "child")])
    c = _client(db)
    r = c.post("/api/households/invite", json={"email": "member@x.com"}, headers=H(3))
    assert r.status_code == 403


# ───────────────────────── Change role ─────────────────────────
def test_change_role_200_404_400():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_user(db, 2, "member@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner"), (2, "parent")])
    c = _client(db)
    r = c.patch("/api/households/members/2/role", json={"role": "child"}, headers=H(1))
    assert r.status_code == 200
    assert r.json() == {"id": 2, "role": "child"}
    assert c.patch("/api/households/members/99/role", json={"role": "child"},
                   headers=H(1)).status_code == 404
    assert c.patch("/api/households/members/2/role", json={"role": "owner"},
                   headers=H(1)).status_code == 400


def test_change_role_403_not_owner():
    db = FakeDB()
    seed_user(db, 1, "owner@x.com", household_id=1)
    seed_user(db, 3, "child@x.com", household_id=1)
    seed_household(db, 1, "Smith", owner_id=1, members=[(1, "owner"), (3, "child")])
    c = _client(db)
    r = c.patch("/api/households/members/1/role", json={"role": "child"}, headers=H(3))
    assert r.status_code == 403


# ───────────────────────── Route registration ─────────────────────────
def test_routes_registered(registered_paths):
    assert "/api/households" in registered_paths
    assert "/api/households/me" in registered_paths
    assert "/api/households/{household_id}" in registered_paths
    assert "/api/households/{household_id}/members" in registered_paths
    assert "/api/households/{household_id}" in registered_paths
    assert "/api/households/{household_id}/members/{user_id}" in registered_paths
    assert "/api/households/invite" in registered_paths
    assert "/api/households/members/{user_id}/role" in registered_paths
