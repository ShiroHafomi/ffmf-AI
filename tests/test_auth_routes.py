"""Tests for /api/auth/register (DB + bcrypt stubbed).

Mirros test_expense_routes: patch the DB functions in the routes
namespace, stub bcrypt, and assert the Node-matching behaviour
(201 + {user}, 409 on dup email, 400 on bad input).
"""

from fastapi.testclient import TestClient

import routes.auth as ra
import main


class FakeDB:
    def __init__(self):
        self.users = {}
        self.seq = 0
        self.emails = set()

    def email_exists(self, email):
        return email in self.emails

    def create_user(self, email, password_hash, name=None):
        self.seq += 1
        self.emails.add(email)
        self.users[self.seq] = {
            "id": self.seq,
            "email": email,
            "full_name": None,
            "name": name,
            "role_id": 3,
            "household_id": None,
            "status": 1,
            "household_role": None,
            "password_hash": password_hash,
        }
        return self.seq

    def find_user_by_id(self, user_id):
        return self.users.get(user_id)


def _client(db):
    ra.email_exists = db.email_exists
    ra.create_user = db.create_user
    ra.find_user_by_id = db.find_user_by_id
    ra.bcrypt.hashpw = lambda pw, salt: b"$2y$10$fakehashfor" + pw[:8]
    ra.bcrypt.gensalt = lambda cost: b"$2y$10$fakesalt$"
    return TestClient(main.app)


def test_register_201_returns_user():
    db = FakeDB()
    c = _client(db)
    r = c.post("/api/auth/register", json={
        "email": "New@Example.com", "password": "secret123", "name": "New"
    })
    assert r.status_code == 201, r.text
    user = r.json()["detail"]
    assert user["id"] == 1
    assert user["email"] == "new@example.com"  # normalied lowercase
    assert user["role_id"] == 3
    assert user["status"] == 1
    assert "password_hash" not in user


def test_register_rejects_duplicate_email():
    db = FakeDB()
    c = _client(db)
    c.post("/api/auth/register", json={"email": "a@b.com", "password": "secret123"})
    r = c.post("/api/auth/register", json={"email": "a@b.com", "password": "secret123"})
    assert r.status_code == 409, r.text
    assert "already" in r.json()["detail"].lower()


def test_register_rejects_invalid_email():
    db = FakeDB()
    c = _client(db)
    r = c.post("/api/auth/register", json={"email": "not-an-email", "password": "secret123"})
    assert r.status_code == 400
    assert "email" in r.json()["detail"].lower()


def test_register_rejects_short_password():
    db = FakeDB()
    c = _client(db)
    r = c.post("/api/auth/register", json={"email": "x@y.com", "password": "123"})
    assert r.status_code == 400
    assert "password" in r.json()["detail"].lower()


def test_register_route_registered(registered_paths):
    assert "/api/auth/register" in registered_paths
