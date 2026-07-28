"""In-memory TTL cache for prediction / insights results.

Household financial data changes at most monthly, so caching the (otherwise
fully recomputed) forecast + analysis for a few minutes cuts DB load and latency
dramatically. The cache is also explicitly invalidated when a household's
expenses change (see routes/expenses.py), so freshness is preserved without
relying solely on TTL expiry.

Design notes:
- Thread-safe: requests run on Starlette's threadpool, so all dict access is
  guarded by a lock.
- No external dependency and no serialization: values are stored by reference
  (the route responses are plain JSON-serializable dicts).
- Bounded: an LRU cap guards against unbounded growth; TTL expiry is checked on
  access. Both are cheap because the cache is small.
"""

import os
import threading
import time
from collections import OrderedDict

# TTL for cached results, in seconds (configurable). A few minutes is safe:
# household data is effectively static between months, and writes invalidate
# explicitly anyway.
try:
    CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "300"))
except ValueError:
    CACHE_TTL_SECONDS = 300
if CACHE_TTL_SECONDS < 0:
    CACHE_TTL_SECONDS = 0

# Max number of cached entries (LRU eviction when exceeded).
_MAX_ENTRIES = 2000

_lock = threading.Lock()
_store: "OrderedDict[str, tuple[float, object]]" = OrderedDict()


def make_key(endpoint: str, household_id: int, *parts) -> str:
    """Build a stable cache key including the params that affect the result.

    ``endpoint`` distinguishes /predict vs /insights; the remaining parts
    (threshold, category_thresholds, ...) capture request-specific inputs.
    """
    return ":".join(str(p) for p in (endpoint, household_id, *parts))


def get(key: str):
    """Return the cached value if present and unexpired, else ``None``.

    Evicts the entry if it has expired (lazy expiry).
    """
    with _lock:
        entry = _store.get(key)
        if entry is None:
            return None
        expiry, value = entry
        if expiry <= time.monotonic():
            _store.pop(key, None)
            return None
        # Mark as recently used for LRU.
        _store.move_to_end(key)
        return value


def set(key: str, value, ttl: int = CACHE_TTL_SECONDS) -> None:
    """Store ``value`` under ``key`` with the given TTL (seconds)."""
    with _lock:
        expiry = time.monotonic() + max(0, ttl)
        _store[key] = (expiry, value)
        _store.move_to_end(key)
        # Evict least-recently-used entries beyond the cap.
        while len(_store) > _MAX_ENTRIES:
            _store.popitem(last=False)


def invalidate_household(household_id: int) -> None:
    """Drop every cached entry for a household (e.g. after an expense write).

    Keys are ``"endpoint:household_id:..."`` so we match on the second field.
    """
    target = f":{household_id}:"
    with _lock:
        stale = [k for k in _store if target in k]
        for k in stale:
            _store.pop(k, None)


def clear() -> None:
    """Empty the cache (used by tests)."""
    with _lock:
        _store.clear()


# ───────────────────────── Admin functions ─────────────────────────
def get_admin_stats() -> dict:
    """Return cache statistics for admin dashboard."""
    with _lock:
        now = time.monotonic()
        by_household: dict[int, int] = {}
        expired = 0
        active = 0
        for key, (expiry, _) in _store.items():
            if expiry <= now:
                expired += 1
            else:
                active += 1
                # Parse household_id from key: "endpoint:household_id:..."
                parts = key.split(":")
                if len(parts) >= 2 and parts[1].isdigit():
                    hid = int(parts[1])
                    by_household[hid] = by_household.get(hid, 0) + 1
        return {
            "total_entries": len(_store),
            "active_entries": active,
            "expired_entries": expired,
            "max_entries": _MAX_ENTRIES,
            "ttl_seconds": CACHE_TTL_SECONDS,
            "by_household": by_household,
        }


def clear_all() -> int:
    """Clear entire cache. Returns number of entries removed."""
    with _lock:
        count = len(_store)
        _store.clear()
        return count


def clear_household(household_id: int) -> int:
    """Clear cache for a specific household. Returns number of entries removed."""
    target = f":{household_id}:"
    with _lock:
        stale = [k for k in _store if target in k]
        for k in stale:
            _store.pop(k, None)
        return len(stale)
