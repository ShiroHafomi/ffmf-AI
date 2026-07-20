"""Tests for the /api/expenses CRUD endpoints (DB layer stubbed).

Mirrors the earlier integration check: we patch the DB functions in the
routes namespace (they are statically imported there) so no live MySQL
is needed. Covers the full CRUD lifecycle plus validation / 404 paths.
"""

from fastapi.testclient import TestClient

import routes.expenses as re
import main


# ───────────────────────── In-memory fake DB ─────────────────────────
class FakeDB:
    def __init__(self):
        self.rows = {}
        self.seq = 0
        self.categories = {1: 10, 2: 20}  # category_id -> household_id
        self.insert_calls = []
        self.update_calls = []
        self.delete_calls = []

    def insert_expense(self, household_id, amount, category_id, expense_date, description, user_id=None):
        self.seq += 1
        self.rows[self.seq] = {
            "id": self.seq,
            "household_id": household_id,
            "category_id": category_id,
            "amount": amount,
            "description": description,
            "expense_date": expense_date,
            "user_id": user_id,
            "category_name": f"Cat{category_id}" if category_id else None,
        }
        self.insert_calls.append((household_id, amount, category_id))
        return self.seq

    def list_expenses(self, household_id, limit=50):
        out = [r for r in self.rows.values() if household_id is None or r["household_id"] == household_id]
        out = sorted(out, key=lambda r: r["id"], reverse=True)
        return out[: min(int(limit), 200)]

    def get_expense_by_id(self, expense_id):
        return self.rows.get(expense_id)

    def update_expense(self, expense_id, amount=None, category_id=None, expense_date=None, description=None):
        self.update_calls.append((expense_id, amount, category_id, expense_date, description))
        r = self.rows.get(expense_id)
        if not r:
            return False
        if amount is not None:
            r["amount"] = amount
        if category_id is not None:
            r["category_id"] = category_id
            r["category_name"] = f"Cat{category_id}" if category_id else None
        if expense_date is not None:
            r["expense_date"] = expense_date
        if description is not None:
            r["description"] = description
        return True

    def delete_expense(self, expense_id):
        self.delete_calls.append(expense_id)
        return self.rows.pop(expense_id, None) is not None

    def category_belongs_to_household(self, household_id, category_id):
        return self.categories.get(category_id) == household_id


def _patch(db):
    re.insert_expense = db.insert_expense
    re.list_expenses = db.list_expenses
    re.get_expense_by_id = db.get_expense_by_id
    re.update_expense = db.update_expense
    re.delete_expense = db.delete_expense
    re.category_belongs_to_household = db.category_belongs_to_household


def _client(db):
    _patch(db)
    return TestClient(main.app)


# ───────────────────────── CRUD lifecycle ─────────────────────────
def test_create_returns_201_with_expense():
    db = FakeDB()
    c = _client(db)
    r = c.post("/api/expenses", json={
        "household_id": 10, "amount": 250.5,
        "category_id": 1, "expense_date": "2026-07-20",
        "description": "Groceries",
    })
    assert r.status_code == 201, r.text
    body = r.json()["detail"]
    assert body["id"] == 1
    assert body["amount"] == 250.5
    assert body["category_name"] == "Cat1"
    assert body["expense_date"] == "2026-07-20"
    assert db.insert_calls == [(10, 250.5, 1)]


def test_get_list_returns_expenses_array():
    db = FakeDB()
    c = _client(db)
    c.post("/api/expenses", json={"household_id": 10, "amount": 100})
    c.post("/api/expenses", json={"household_id": 10, "amount": 200})
    r = c.get("/api/expenses?household_id=10")
    assert r.status_code == 200
    assert len(r.json()["expenses"]) == 2


def test_get_by_id_returns_expense_object():
    db = FakeDB()
    c = _client(db)
    created = c.post("/api/expenses", json={"household_id": 10, "amount": 100}).json()["detail"]
    r = c.get(f"/api/expenses/{created['id']}")
    assert r.status_code == 200
    assert r.json()["expense"] == created


def test_update_partial_fields():
    db = FakeDB()
    c = _client(db)
    created = c.post("/api/expenses", json={
        "household_id": 10, "amount": 100, "category_id": 1, "description": "old"
    }).json()["detail"]
    r = c.put(f"/api/expenses/{created['id']}", json={"amount": 999.0, "description": "new"})
    assert r.status_code == 200
    body = r.json()
    assert body["amount"] == 999.0
    assert body["description"] == "new"
    assert body["category_id"] == 1  # unchanged
    assert db.update_calls[-1][1] == 999.0


def test_delete_returns_ok():
    db = FakeDB()
    c = _client(db)
    created = c.post("/api/expenses", json={"household_id": 10, "amount": 100}).json()["detail"]
    r = c.delete(f"/api/expenses/{created['id']}")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert c.get(f"/api/expenses/{created['id']}").status_code == 404


# ───────────────────────── Validation / error paths ─────────────────────────
def test_create_rejects_nonpositive_amount():
    db = FakeDB()
    c = _client(db)
    r = c.post("/api/expenses", json={"household_id": 10, "amount": -5})
    assert r.status_code == 400
    assert "amount" in r.json()["detail"].lower()


def test_create_rejects_bad_date_format():
    db = FakeDB()
    c = _client(db)
    r = c.post("/api/expenses", json={
        "household_id": 10, "amount": 50, "expense_date": "20/07/2026"
    })
    assert r.status_code == 400
    assert "yyyy-mm-dd" in r.json()["detail"].lower()


def test_create_rejects_foreign_category():
    db = FakeDB()
    c = _client(db)
    # category 2 belongs to household 20, not 10
    r = c.post("/api/expenses", json={"household_id": 10, "amount": 50, "category_id": 2})
    assert r.status_code == 400
    assert "household" in r.json()["detail"].lower()


def test_get_missing_returns_404():
    db = FakeDB()
    c = _client(db)
    assert c.get("/api/expenses/999").status_code == 404


def test_update_missing_returns_404():
    db = FakeDB()
    c = _client(db)
    assert c.put("/api/expenses/999", json={"amount": 1}).status_code == 404


def test_delete_missing_returns_404():
    db = FakeDB()
    c = _client(db)
    assert c.delete("/api/expenses/999").status_code == 404


def test_routes_registered(registered_paths):
    assert "/api/expenses" in registered_paths
    assert "/api/expenses/{expense_id}" in registered_paths
