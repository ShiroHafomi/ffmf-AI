"""Tests for the /admin/* endpoints (DB layer stubbed).

Mirrors test_expense_routes.py: we bump RATE_LIMIT_PER_MINUTE so the shared
in-memory limiter never trips during the run, then patch the service functions
in the routes namespace (they are statically imported there) so no live MySQL
is needed. Covers all admin endpoints plus auth (403/404) paths.
"""

import os
from typing import Optional

# Raise the per-IP rate limit before main (and services.limiter) is imported,
# so the in-memory limiter can't return 429 mid-suite.
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "100000")

# Admin key is set in conftest.py (before any module imports).
from fastapi.testclient import TestClient

import routes.admin as ra
import main


# ───────────────────────── In-memory fake DB ─────────────────────────
class FakeDB:
    def __init__(self):
        self.users = {}
        self.households = {}
        self.expenses = {}
        self.budgets = {}
        self.categories = {}
        self.incomes = {}
        self.h_seq = 0
        self.u_seq = 0
        self.e_seq = 0
        self.b_seq = 0
        self.c_seq = 0
        self.i_seq = 0

    def list_users(self, page=1, page_size=50, search=None, connection=None):
        rows = list(self.users.values())
        if search:
            like = search.lower()
            rows = [r for r in rows if like in (r.get("name", "") or "").lower() or like in r.get("email", "").lower()]
        total = len(rows)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "users": rows[start:end],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        }

    def set_user_role(self, user_id: int, role_id: int, connection=None):
        u = self.users.get(user_id)
        if not u:
            return False
        u["role_id"] = role_id
        return True

    def delete_user(self, user_id: int, acting_user_id: int, connection=None):
        if user_id == acting_user_id:
            raise ValueError("cannot delete your own account")
        u = self.users.get(user_id)
        if not u:
            raise ValueError("user not found")
        if u.get("role_id") == 1:
            admins = sum(1 for v in self.users.values() if v.get("role_id") == 1)
            if admins <= 1:
                raise ValueError("cannot remove the last admin")
        # null out FKs
        for e in self.expenses.values():
            if e.get("user_id") == user_id:
                e["user_id"] = None
        for i in self.incomes.values():
            if i.get("user_id") == user_id:
                i["user_id"] = None
        del self.users[user_id]
        return True

    def create_user(
        self,
        email: str,
        name: Optional[str] = None,
        password: Optional[str] = None,
        role_id: int = 3,
        household_id: Optional[int] = None,
        connection=None,
    ):
        # Check email uniqueness
        for u in self.users.values():
            if u.get("email") == email:
                raise ValueError("email already exists")

        if role_id not in (1, 3):
            raise ValueError("role_id must be 1 (admin) or 3 (member)")

        import secrets
        import bcrypt

        # Generate password if not provided
        if password is None:
            password = secrets.token_urlsafe(12)

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        display_id = "U" + secrets.token_hex(4).upper()

        user_id = max(self.users.keys(), default=0) + 1
        self.users[user_id] = {
            "id": user_id,
            "display_id": display_id,
            "email": email,
            "name": name,
            "full_name": name,
            "password_hash": password_hash,
            "role_id": role_id,
            "household_id": household_id,
            "status": 1,
            "created_at": "2026-07-20T00:00:00",
        }

        return {
            "id": user_id,
            "display_id": display_id,
            "email": email,
            "name": name,
            "role_id": role_id,
            "household_id": household_id,
            "status": 1,
            "password": password,
        }

    def list_households(self, page=1, page_size=50, include_deleted=False, connection=None):
        rows = [h for h in self.households.values() if include_deleted or not h.get("is_deleted")]
        total = len(rows)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "households": rows[start:end],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        }

    def soft_delete_household(self, household_id: int, connection=None):
        h = self.households.get(household_id)
        if not h:
            return False
        h["is_deleted"] = 1
        return True

    def get_household_members(self, household_id: int, connection=None):
        return []  # simplified

    def list_expenses(self, page=1, page_size=50, household_id=None, connection=None):
        rows = list(self.expenses.values())
        if household_id is not None:
            rows = [e for e in rows if e.get("household_id") == household_id]
        total = len(rows)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "expenses": rows[start:end],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        }

    def list_budgets(self, page=1, page_size=50, household_id=None, connection=None):
        rows = list(self.budgets.values())
        if household_id is not None:
            rows = [b for b in rows if b.get("household_id") == household_id]
        total = len(rows)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "budgets": rows[start:end],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        }

    def list_categories(self, page=1, page_size=50, household_id=None, connection=None):
        rows = list(self.categories.values())
        if household_id is not None:
            rows = [c for c in rows if c.get("household_id") == household_id]
        total = len(rows)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "categories": rows[start:end],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        }

    def list_incomes(self, page=1, page_size=50, household_id=None, connection=None):
        rows = list(self.incomes.values())
        if household_id is not None:
            rows = [i for i in rows if i.get("household_id") == household_id]
        total = len(rows)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "incomes": rows[start:end],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        }

    def get_system_summary(self, connection=None):
        return {
            "total_users": len(self.users),
            "total_households": len([h for h in self.households.values() if not h.get("is_deleted")]),
            "total_expenses": len(self.expenses),
            "total_incomes": len(self.incomes),
            "total_budgets": len(self.budgets),
            "total_categories": len(self.categories),
        }

    def get_system_health(self, connection=None):
        # Mock health data
        return {
            "status": "ok",
            "uptime_seconds": 3600,
            "database": {"pool_size": 10, "active_connections": 1, "idle_connections": 9},
            "cache": {"total_entries": 0, "active_entries": 0},
            "rate_limit_per_minute": 60,
        }


def seed_user(db, uid, email, role_id=3, household_id=None, name=None, status=1):
    db.users[uid] = {
        "id": uid,
        "email": email,
        "name": name,
        "full_name": name,
        "role_id": role_id,
        "household_id": household_id,
        "status": status,
        "display_id": f"U{uid:08X}",
        "created_at": "2026-07-20T00:00:00",
    }


def seed_household(db, hid, name, is_deleted=0):
    db.households[hid] = {
        "id": hid,
        "name": name,
        "description": f"Description for {name}",
        "created_at": "2026-07-20T00:00:00",
        "is_deleted": is_deleted,
    }


def seed_expense(db, eid, household_id, category_name="Food", amount=100.0):
    db.expenses[eid] = {
        "id": eid,
        "household_id": household_id,
        "category_id": 1,
        "amount": amount,
        "description": "Test expense",
        "expense_date": "2026-07-20",
        "user_id": 1,
        "category_name": category_name,
    }


def seed_budget(db, bid, household_id, category_name="Food", amount=500.0):
    db.budgets[bid] = {
        "id": bid,
        "household_id": household_id,
        "category_id": 1,
        "year": 2026,
        "month": 7,
        "amount": amount,
        "category_name": category_name,
    }


def seed_category(db, cid, household_id, name="Food"):
    db.categories[cid] = {
        "id": cid,
        "household_id": household_id,
        "name": name,
        "icon": "🍔",
        "color": "#FF0000",
        "created_at": "2026-07-20T00:00:00",
    }


def seed_income(db, iid, household_id, user_name="John", amount=1000.0):
    db.incomes[iid] = {
        "id": iid,
        "household_id": household_id,
        "user_id": 1,
        "amount": amount,
        "source": "Salary",
        "income_date": "2026-07-20",
        "created_at": "2026-07-20T00:00:00",
        "user_name": user_name,
    }


def _patch(db):
    ra.list_users = db.list_users
    ra.set_user_role = db.set_user_role
    ra.delete_user = db.delete_user
    ra.create_user = db.create_user
    ra.list_households = db.list_households
    ra.soft_delete_household = db.soft_delete_household
    ra.get_household_members = db.get_household_members
    ra.list_expenses = db.list_expenses
    ra.list_budgets = db.list_budgets
    ra.list_categories = db.list_categories
    ra.list_incomes = db.list_incomes
    ra.get_system_summary = db.get_system_summary
    ra.get_system_health = db.get_system_health


def _client(db):
    _patch(db)
    return TestClient(main.app)


def A():
    """Headers with valid admin key."""
    return {"X-Admin-Key": "test-admin-key-123"}


def A_bad():
    """Headers with invalid admin key."""
    return {"X-Admin-Key": "wrong-key"}


# ───────────────────────── Auth ─────────────────────────
def test_admin_403_without_key():
    """No admin key -> 403 (when ADMIN_API_KEY is configured)."""
    db = FakeDB()
    c = _client(db)
    r = c.get("/admin/stats")
    assert r.status_code == 403
    assert "forbidden" in r.json()["detail"].lower()


def test_admin_403_with_bad_key():
    """Wrong admin key -> 403."""
    db = FakeDB()
    c = _client(db)
    r = c.get("/admin/stats", headers=A_bad())
    assert r.status_code == 403


def test_admin_dashboard_404_without_key():
    """Admin dashboard also protected."""
    db = FakeDB()
    c = _client(db)
    r = c.get("/admin/dashboard")
    assert r.status_code == 403


# ───────────────────────── System Stats ─────────────────────────
def test_admin_stats_200():
    db = FakeDB()
    seed_user(db, 1, "admin@test.com", role_id=1)
    seed_user(db, 2, "user@test.com", role_id=3)
    seed_household(db, 1, "Smith")
    seed_expense(db, 1, 1)
    seed_income(db, 1, 1)
    seed_budget(db, 1, 1)
    seed_category(db, 1, 1)
    c = _client(db)
    r = c.get("/admin/stats", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert body["total_users"] == 2
    assert body["total_households"] == 1
    assert body["total_expenses"] == 1
    assert body["total_incomes"] == 1
    assert body["total_budgets"] == 1
    assert body["total_categories"] == 1


# ───────────────────────── Users ─────────────────────────
def test_admin_list_users_200():
    db = FakeDB()
    seed_user(db, 1, "admin@test.com", role_id=1, name="Admin")
    seed_user(db, 2, "user@test.com", role_id=3, name="User")
    seed_user(db, 3, "other@test.com", role_id=3, name="Other")
    c = _client(db)
    r = c.get("/admin/users", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert len(body["users"]) == 3
    assert body["users"][0]["email"] == "admin@test.com"
    assert body["users"][0]["role_id"] == 1


def test_admin_list_users_search():
    db = FakeDB()
    seed_user(db, 1, "admin@test.com", name="Admin")
    seed_user(db, 2, "john@test.com", name="John")
    seed_user(db, 3, "jane@test.com", name="Jane")
    c = _client(db)
    r = c.get("/admin/users?search=john", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["users"][0]["email"] == "john@test.com"


def test_admin_list_users_pagination():
    db = FakeDB()
    for i in range(60):
        seed_user(db, i + 1, f"user{i}@test.com")
    c = _client(db)
    r = c.get("/admin/users?page=1&page_size=50", headers=A())
    assert r.status_code == 200
    assert len(r.json()["users"]) == 50
    r2 = c.get("/admin/users?page=2&page_size=50", headers=A())
    assert len(r2.json()["users"]) == 10


def test_admin_set_user_role_200():
    db = FakeDB()
    seed_user(db, 2, "user@test.com", role_id=3)
    c = _client(db)
    r = c.put("/admin/users/2/role", json={"role_id": 1}, headers=A())
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == 2
    assert body["role_id"] == 1


def test_admin_set_user_role_404():
    db = FakeDB()
    c = _client(db)
    r = c.put("/admin/users/999/role", json={"role_id": 1}, headers=A())
    assert r.status_code == 404


def test_admin_set_user_role_400_bad_role():
    db = FakeDB()
    seed_user(db, 2, "user@test.com", role_id=3)
    c = _client(db)
    r = c.put("/admin/users/2/role", json={"role_id": 99}, headers=A())
    assert r.status_code == 400


def test_admin_delete_user_200():
    db = FakeDB()
    seed_user(db, 1, "admin@test.com", role_id=1)  # acting admin
    seed_user(db, 2, "user@test.com", role_id=3)
    c = _client(db)
    r = c.delete("/admin/users/2?acting_user_id=1", headers=A())
    assert r.status_code == 200
    assert r.json()["deleted"] is True
    assert 2 not in db.users


def test_admin_delete_user_400_self():
    db = FakeDB()
    seed_user(db, 1, "admin@test.com", role_id=1)
    c = _client(db)
    r = c.delete("/admin/users/1?acting_user_id=1", headers=A())
    assert r.status_code == 400
    assert "own" in r.json()["detail"].lower()


def test_admin_delete_user_400_last_admin():
    db = FakeDB()
    seed_user(db, 1, "admin@test.com", role_id=1)
    c = _client(db)
    r = c.delete("/admin/users/1?acting_user_id=2", headers=A())
    assert r.status_code == 400
    assert "last admin" in r.json()["detail"].lower()


def test_admin_delete_user_404():
    db = FakeDB()
    c = _client(db)
    r = c.delete("/admin/users/999?acting_user_id=1", headers=A())
    assert r.status_code == 404


def test_admin_create_user_200():
    db = FakeDB()
    seed_user(db, 1, "admin@test.com", role_id=1)  # acting admin
    c = _client(db)
    r = c.post("/admin/users", json={"email": "newuser@test.com", "name": "New User", "role_id": 3}, headers=A())
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["email"] == "newuser@test.com"
    assert body["user"]["name"] == "New User"
    assert body["user"]["role_id"] == 3
    assert "password" in body["user"]  # password should be returned when auto-generated


def test_admin_create_user_409_duplicate_email():
    db = FakeDB()
    seed_user(db, 1, "admin@test.com", role_id=1)
    seed_user(db, 2, "user@test.com", role_id=3)
    c = _client(db)
    r = c.post("/admin/users", json={"email": "user@test.com", "role_id": 3}, headers=A())
    assert r.status_code == 409
    assert "email" in r.json()["detail"].lower()


def test_admin_create_user_400_bad_role():
    db = FakeDB()
    seed_user(db, 1, "admin@test.com", role_id=1)
    c = _client(db)
    r = c.post("/admin/users", json={"email": "new@test.com", "role_id": 99}, headers=A())
    assert r.status_code == 400


# ───────────────────────── Households ─────────────────────────
def test_admin_list_households_200():
    db = FakeDB()
    seed_household(db, 1, "Smith")
    seed_household(db, 2, "Jones")
    seed_household(db, 3, "Deleted", is_deleted=1)
    c = _client(db)
    r = c.get("/admin/households", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2  # only non-deleted by default
    r2 = c.get("/admin/households?include_deleted=true", headers=A())
    assert r2.json()["total"] == 3


def test_admin_soft_delete_household_200():
    db = FakeDB()
    seed_household(db, 1, "Smith")
    c = _client(db)
    r = c.delete("/admin/households/1", headers=A())
    assert r.status_code == 200
    assert r.json()["deleted"] is True
    assert db.households[1]["is_deleted"] == 1


def test_admin_soft_delete_household_404():
    db = FakeDB()
    c = _client(db)
    r = c.delete("/admin/households/999", headers=A())
    assert r.status_code == 404


def test_admin_household_members_200():
    db = FakeDB()
    seed_household(db, 1, "Smith")
    c = _client(db)
    r = c.get("/admin/households/1/members", headers=A())
    assert r.status_code == 200
    assert r.json()["household_id"] == 1
    assert "members" in r.json()


# ───────────────────────── Expenses ─────────────────────────
def test_admin_list_expenses_200():
    db = FakeDB()
    seed_expense(db, 1, 1, "Food", 100.0)
    seed_expense(db, 2, 1, "Transport", 200.0)
    seed_expense(db, 3, 2, "Food", 300.0)
    c = _client(db)
    r = c.get("/admin/expenses", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    # filter by household
    r2 = c.get("/admin/expenses?household_id=1", headers=A())
    assert r2.json()["total"] == 2


# ───────────────────────── Budgets ─────────────────────────
def test_admin_list_budgets_200():
    db = FakeDB()
    seed_budget(db, 1, 1, "Food", 500.0)
    seed_budget(db, 2, 2, "Rent", 1000.0)
    c = _client(db)
    r = c.get("/admin/budgets", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    r2 = c.get("/admin/budgets?household_id=1", headers=A())
    assert r2.json()["total"] == 1


# ───────────────────────── Categories ─────────────────────────
def test_admin_list_categories_200():
    db = FakeDB()
    seed_category(db, 1, 1, "Food")
    seed_category(db, 2, 1, "Transport")
    seed_category(db, 3, 2, "Food")
    c = _client(db)
    r = c.get("/admin/categories", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    r2 = c.get("/admin/categories?household_id=1", headers=A())
    assert r2.json()["total"] == 2


# ───────────────────────── Incomes ─────────────────────────
def test_admin_list_incomes_200():
    db = FakeDB()
    seed_income(db, 1, 1, "John", 1000.0)
    seed_income(db, 2, 2, "Jane", 2000.0)
    c = _client(db)
    r = c.get("/admin/incomes", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    r2 = c.get("/admin/incomes?household_id=1", headers=A())
    assert r2.json()["total"] == 1


# ───────────────────────── Cache ─────────────────────────
def test_admin_cache_stats_200():
    from services import cache
    cache.clear()
    db = FakeDB()
    c = _client(db)
    r = c.get("/admin/cache", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert "total_entries" in body
    assert "active_entries" in body
    assert "expired_entries" in body
    assert "ttl_seconds" in body
    assert "max_entries" in body
    assert "by_household" in body


def test_admin_clear_cache_all_200():
    from services import cache
    cache.clear()
    db = FakeDB()
    c = _client(db)
    # Add some fake cache entries by calling internal
    cache.set("predict:1:80", {"predicted": 100})
    cache.set("insights:1:80", {"predicted": 200})
    r = c.post("/admin/cache/clear", json={}, headers=A())
    assert r.status_code == 200
    assert r.json()["cleared"] == 2
    assert r.json()["all"] is True


def test_admin_clear_cache_household_200():
    from services import cache
    cache.clear()
    db = FakeDB()
    c = _client(db)
    cache.set("predict:1:80", {"predicted": 100})
    cache.set("predict:2:80", {"predicted": 200})
    r = c.post("/admin/cache/clear", json={"household_id": 1}, headers=A())
    assert r.status_code == 200
    assert r.json()["cleared"] == 1
    assert r.json()["household_id"] == 1


# ───────────────────────── Health ─────────────────────────
def test_admin_health_200():
    db = FakeDB()
    c = _client(db)
    r = c.get("/admin/health", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "uptime_seconds" in body
    assert "database" in body
    assert "cache" in body
    assert "rate_limit_per_minute" in body


# ───────────────────────── Logs ─────────────────────────
def test_admin_logs_200():
    db = FakeDB()
    c = _client(db)
    r = c.get("/admin/logs", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert "logs" in body
    assert "count" in body


def test_admin_logs_filter():
    db = FakeDB()
    c = _client(db)
    r = c.get("/admin/logs?level=ERROR&limit=10", headers=A())
    assert r.status_code == 200
    body = r.json()
    assert "logs" in body


# ───────────────────────── Route registration ─────────────────────────
def test_admin_routes_registered(registered_paths):
    assert "/admin/stats" in registered_paths
    assert "/admin/users" in registered_paths
    assert "/admin/users/{user_id}/role" in registered_paths
    assert "/admin/users/{user_id}" in registered_paths
    assert "/admin/households" in registered_paths
    assert "/admin/households/{household_id}" in registered_paths
    assert "/admin/households/{household_id}/members" in registered_paths
    assert "/admin/expenses" in registered_paths
    assert "/admin/budgets" in registered_paths
    assert "/admin/categories" in registered_paths
    assert "/admin/incomes" in registered_paths
    assert "/admin/cache" in registered_paths
    assert "/admin/cache/clear" in registered_paths
    assert "/admin/health" in registered_paths
    assert "/admin/logs" in registered_paths
    assert "/admin/dashboard" in registered_paths