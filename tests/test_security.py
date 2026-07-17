"""Regression tests for the security layers (API-key auth + input validation).

These run with AI_SERVICE_API_KEY set, forcing the key check on. They do not
touch the database — negative ids are rejected by validation (400) before any
DB call, and a valid id returns 500 only because there is no DB in the test env
(which proves auth/validation passed through to the handler.
"""

import sys

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "testkey")
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "100000")  # never trip in tests
    # Force a fresh import so the key is read at module load.
    sys.modules.pop("main", None)
    import main

    return TestClient(main.app)


def test_root_is_open(client):
    assert client.get("/").status_code == 200


def test_missing_api_key_is_forbidden(client):
    assert client.get("/predict/1").status_code == 403


def test_wrong_api_key_is_forbidden(client):
    assert client.get("/predict/1", headers={"X-API-Key": "nope"}).status_code == 403


def test_valid_key_with_negative_id_is_400(client):
    r = client.get("/predict/-5", headers={"X-API-Key": "testkey"})
    assert r.status_code == 400


def test_valid_key_with_zero_id_is_400(client):
    r = client.get("/predict/0", headers={"X-API-Key": "testkey"})
    assert r.status_code == 400


def test_valid_key_reaches_handler(client):
    # Valid id -> auth + validation pass; only the missing DB (500) remains.
    r = client.get("/predict/1", headers={"X-API-Key": "testkey"})
    assert r.status_code == 500


def test_insights_valid_key_reaches_handler(client):
    r = client.get("/insights/1", headers={"X-API-Key": "testkey"})
    assert r.status_code == 500
