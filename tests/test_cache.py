"""Tests for the in-memory TTL cache (services/cache.py).

Pure/offline: no DB, no network. Cover the round-trip, per-household
invalidation, clear, and TTL expiry (monkeypatching the monotonic clock).
"""

import pytest

from services import cache


@pytest.fixture(autouse=True)
def _clean_cache():
    """Start every test with an empty cache and leave it empty afterwards."""
    cache.clear()
    yield
    cache.clear()


def test_set_get_round_trip():
    key = cache.make_key("predict", 1, 80, None)
    payload = {"predicted": 123.45, "status": "normal"}
    cache.set(key, payload)
    assert cache.get(key) is payload


def test_get_missing_returns_none():
    assert cache.get("nope") is None


def test_make_key_is_stable_and_param_sensitive():
    k1 = cache.make_key("predict", 1, 80, None)
    k2 = cache.make_key("predict", 1, 80, None)
    k3 = cache.make_key("predict", 1, 90, None)  # different threshold
    k4 = cache.make_key("insights", 1, 80, None)  # different endpoint
    assert k1 == k2
    assert k1 != k3
    assert k1 != k4


def test_invalidate_household_drops_only_that_household():
    cache.set(cache.make_key("predict", 1, 80, None), {"h": 1})
    cache.set(cache.make_key("insights", 1, 80, None), {"h": 1})
    cache.set(cache.make_key("predict", 2, 80, None), {"h": 2})

    cache.invalidate_household(1)

    assert cache.get(cache.make_key("predict", 1, 80, None)) is None
    assert cache.get(cache.make_key("insights", 1, 80, None)) is None
    # Household 2 is untouched.
    assert cache.get(cache.make_key("predict", 2, 80, None)) == {"h": 2}


def test_invalidate_household_no_substring_collision():
    """household 1 must not invalidate household 11 (keys are ':id:'-delimited)."""
    cache.set(cache.make_key("predict", 1, 80, None), {"h": 1})
    cache.set(cache.make_key("predict", 11, 80, None), {"h": 11})

    cache.invalidate_household(1)

    assert cache.get(cache.make_key("predict", 1, 80, None)) is None
    assert cache.get(cache.make_key("predict", 11, 80, None)) == {"h": 11}


def test_clear_empties_cache():
    cache.set(cache.make_key("predict", 1, 80, None), {"h": 1})
    cache.clear()
    assert cache.get(cache.make_key("predict", 1, 80, None)) is None


def test_ttl_expiry(monkeypatch):
    clock = {"t": 1000.0}
    monkeypatch.setattr(cache.time, "monotonic", lambda: clock["t"])

    key = cache.make_key("predict", 1, 80, None)
    cache.set(key, {"h": 1}, ttl=10)

    clock["t"] = 1005.0  # within TTL
    assert cache.get(key) == {"h": 1}

    clock["t"] = 1011.0  # past TTL
    assert cache.get(key) is None
