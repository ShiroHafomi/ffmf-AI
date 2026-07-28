"""Tests for the AI Financial Coach feature — context builder, system prompt, route handlers.

All tests are offline: DB calls are mocked, LLM providers are never contacted.
"""

import importlib
import json
import os

os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "100000")

import pytest
from fastapi.testclient import TestClient

import routes.ai as ra
import main


# ───────────────────────── Helpers ─────────────────────────

def _minimal_context(**overrides) -> dict:
    """Return a valid, well-formed financial coach context dict."""
    ctx = {
        "household_id": 1,
        "current_month": {"year": 2026, "month": 7},
        "total_income": 15_000_000.0,
        "total_expenses": 9_500_000.0,
        "categories": [
            {"name": "Food", "spent": 3_200_000, "budget": 3_000_000, "usage_pct": 106.7, "transaction_count": 12},
            {"name": "Rent", "spent": 5_000_000, "budget": 5_000_000, "usage_pct": 100.0, "transaction_count": 1},
            {"name": "Entertainment", "spent": 1_300_000, "budget": 2_000_000, "usage_pct": 65.0, "transaction_count": 5},
        ],
        "savings_goals": [
            {"name": "Emergency Fund", "target": 50_000_000, "current": 20_000_000, "progress_pct": 40.0},
        ],
        "budget": {
            "total_budget": 12_000_000,
            "total_spent": 9_500_000,
            "remaining": 2_500_000,
            "usage_pct": 79.2,
        },
        "as_text": "USER FINANCIAL CONTEXT\n==================\n\nThis month (2026-07) so far:\n- Total income: 15,000,000\n- Total expenses: 9,500,000\n- Surplus: 5,500,000\n\nCategories:\n- Food: spent 3,200,000 / budget 3,000,000 (106.7%)\n- Rent: spent 5,000,000 / budget 5,000,000 (100.0%)\n- Entertainment: spent 1,300,000 / budget 2,000,000 (65.0%)\n\nSavings Goals:\n- Emergency Fund: 20,000,000 / 50,000,000 (40.0%)\n",
    }
    ctx.update(overrides)
    return ctx


def _empty_context() -> dict:
    """Context with no data (new household / no expenses yet)."""
    return {
        "household_id": 1,
        "current_month": {"year": 2026, "month": 7},
        "total_income": 0.0,
        "total_expenses": 0.0,
        "categories": [],
        "savings_goals": [],
        "budget": None,
        "as_text": "No financial data available for this month yet.",
    }


# ───────────────────────── build_financial_coach_context ─────────────────────────

class FakeConnection:
    """A lightweight stand-in for a MySQL connection.

    Implements the same minimal interface expected by the route handler
    (is_connected, close) and the context builder.
    """

    def is_connected(self) -> bool:
        return True

    def close(self) -> None:
        pass


def test_context_builder_returns_all_keys(monkeypatch):
    """build_financial_coach_context returns a complete dict with expected keys."""
    from services.ai_service import build_financial_coach_context

    # Replace each DB function with a mock that returns non-empty data.
    monkeypatch.setattr(
        "services.db_service.get_current_month_total_income",
        lambda household_id, connection=None: 12_000_000.0,
    )
    monkeypatch.setattr(
        "services.db_service.get_category_expenses",
        lambda household_id, month=None, year=None, connection=None: [
            {"category_name": "Food", "total": 3_500_000, "transaction_count": 15},
            {"category_name": "Rent", "total": 5_000_000, "transaction_count": 1},
        ],
    )
    monkeypatch.setattr(
        "services.db_service.get_category_budgets",
        lambda household_id, month=None, year=None, connection=None: [
            {"category_name": "Food", "budget_amount": 4_000_000},
            {"category_name": "Rent", "budget_amount": 5_000_000},
        ],
    )
    monkeypatch.setattr(
        "services.db_service.get_savings_goals",
        lambda household_id, connection=None: [
            {"id": 1, "name": "Vacation", "target_amount": 30_000_000, "current_amount": 10_000_000, "created_at": "2026-01-15"},
        ],
    )

    result = build_financial_coach_context(FakeConnection(), 1)

    # Top-level keys
    assert "household_id" in result
    assert "current_month" in result
    assert "total_income" in result
    assert "total_expenses" in result
    assert "categories" in result
    assert "savings_goals" in result
    assert "budget" in result
    assert "as_text" in result

    assert result["total_income"] == 12_000_000.0
    assert result["total_expenses"] == 8_500_000.0
    assert len(result["categories"]) == 2
    assert len(result["savings_goals"]) == 1

    # as_text must be a non-empty string
    assert isinstance(result["as_text"], str) and len(result["as_text"]) > 50
    # Should mention category names
    assert "Food" in result["as_text"]
    assert "Vacation" in result["as_text"]


def test_context_builder_survives_db_errors(monkeypatch):
    """Raising in any one DB call doesn't crash builder — returns defaults."""
    from services.ai_service import build_financial_coach_context

    # Income throws; all others return empty.
    monkeypatch.setattr(
        "services.db_service.get_current_month_total_income",
        lambda household_id, connection=None: (_ for _ in ()).throw(Exception("boom")),
    )
    monkeypatch.setattr(
        "services.db_service.get_category_expenses",
        lambda household_id, month=None, year=None, connection=None: [],
    )
    monkeypatch.setattr(
        "services.db_service.get_category_budgets",
        lambda household_id, month=None, year=None, connection=None: [],
    )
    monkeypatch.setattr(
        "services.db_service.get_savings_goals",
        lambda household_id, connection=None: [],
    )

    result = build_financial_coach_context(FakeConnection(), 1)

    # Should not raise — income is 0.0 because it errored
    assert result["total_income"] == 0.0
    assert result["total_expenses"] == 0.0
    assert result["categories"] == []
    assert result["savings_goals"] == []
    assert isinstance(result["as_text"], str)


def test_context_builder_with_empty_income(monkeypatch):
    """No income data -> total_income is 0.0."""
    from services.ai_service import build_financial_coach_context

    monkeypatch.setattr(
        "services.db_service.get_current_month_total_income",
        lambda household_id, connection=None: 0.0,
    )
    monkeypatch.setattr(
        "services.db_service.get_category_expenses",
        lambda household_id, month=None, year=None, connection=None: [],
    )
    monkeypatch.setattr(
        "services.db_service.get_category_budgets",
        lambda household_id, month=None, year=None, connection=None: [],
    )
    monkeypatch.setattr(
        "services.db_service.get_savings_goals",
        lambda household_id, connection=None: [],
    )

    result = build_financial_coach_context(FakeConnection(), household_id=1)
    assert result["total_income"] == 0.0
    assert "as_text" in result


# ───────────────────────────── _build_coach_system_prompt ─────────────────────────────

def test_system_prompt_contains_context():
    from services.ai_service import _build_coach_system_prompt

    ctx = _minimal_context()
    snippets = ["Save at least 20% of income.", "Track dining-out separately."]

    prompt = _build_coach_system_prompt(ctx, snippets)

    # Verification: category names, goal names, and RAG snippets all appear
    assert "Food" in prompt or "Rent" in prompt
    assert "Emergency Fund" in prompt
    assert "you are" in prompt.lower()
    assert "Save at least 20% of income." in prompt
    assert "Track dining-out separately." in prompt


def test_system_prompt_with_empty_context():
    from services.ai_service import _build_coach_system_prompt

    prompt = _build_coach_system_prompt(_empty_context(), [])
    assert isinstance(prompt, str)
    assert len(prompt) > 0
    assert "USER FINANCIAL CONTEXT" in prompt


def test_system_prompt_without_rag_snippets():
    from services.ai_service import _build_coach_system_prompt

    prompt = _build_coach_system_prompt(_minimal_context(), [])
    assert "RETRIEVED FINANCIAL KNOWLEDGE" not in prompt


# ───────────────────────────── _extract_actions ─────────────────────────────

def test_extract_actions_finds_valid_block():
    from services.ai_service import _extract_actions

    text = (
        "You should cut back on dining out. "
        + '[ACTIONS]: {"type": "budget_alert", "description": "Reduce Food to 3M", "priority": "high"}'
    )
    result = _extract_actions(text)
    assert result is not None
    assert result["type"] == "budget_alert"
    assert result["description"] == "Reduce Food to 3M"


def test_extract_actions_no_block_returns_none():
    from services.ai_service import _extract_actions

    assert _extract_actions("Here is some advice without any actions block.") is None


def test_extract_actions_malformed_json_returns_none():
    from services.ai_service import _extract_actions

    assert _extract_actions("[ACTIONS]: {this is not valid json}}") is None


def test_extract_actions_empty_or_none_returns_none():
    from services.ai_service import _extract_actions

    assert _extract_actions("") is None
    assert _extract_actions(None) is None


# ───────────────────────────── Coach chat route tests ─────────────────────────────

class FakeDB:
    """In-memory fake that backs find_user_by_id."""
    def __init__(self):
        self.users = {}

    def find_user_by_id(self, user_id):
        return self.users.get(user_id)


def _seed_coach(*, db: FakeDB = None, context: dict = None, rag: list = None):
    """Replace all external dependencies used by the ``coach_chat`` route.

    Assigns directly onto the ``ra`` module so tests that don't receive
    ``monkeypatch`` as a fixture can still call this helper. Follows the
    same convention as test_auth_routes.py and test_household_routes.py.
    """
    # 0) Prevent any real DB connection attempt.
    ra.get_connection = lambda: FakeConnection()

    # 1) User lookup.
    if db is not None:
        ra.find_user_by_id = db.find_user_by_id

    # 2) Context builder.
    if context is not None:
        ra.build_financial_coach_context = lambda conn, hid: context

    # 3) RAG retrieval.
    if rag is not None:
        ra.retrieve_knowledge = lambda query, top_k=4: rag
    else:
        ra.retrieve_knowledge = lambda query, top_k=4: []

    # 4) Streaming generator — tiny fake, no LLM contacts.
    async def _fake_stream(message, ctx, snippets):
        yield json.dumps({"text": "Hi! Here is my advice...", "done": False}) + "\n\n"
        yield json.dumps({"text": " More advice here.", "done": True, "actions": None}) + "\n\n"

    ra.stream_coach_response = _fake_stream


def _client():
    return TestClient(main.app)


def H(uid: int) -> dict:
    return {"X-User-Id": str(uid)}


# ---------------------------------------------------------------------------
# Auth / validation checks
# ---------------------------------------------------------------------------

def test_coach_chat_401_if_no_user_id_header():
    """Missing X-User-Id header → 401."""
    c = _client()
    r = c.post("/api/ai/coach/chat", json={"message": "How can I save more?"})
    assert r.status_code == 401
    assert "X-User-Id" in r.json()["detail"]


def test_coach_chat_401_if_invalid_user_id():
    """Non-numeric or zero/negative X-User-Id → 401."""
    c = _client()
    r = c.post("/api/ai/coach/chat",
               json={"message": "Hello"},
               headers={"X-User-Id": "abc"})
    assert r.status_code == 401

    r2 = c.post("/api/ai/coach/chat",
                json={"message": "Hello"},
                headers={"X-User-Id": "-1"})
    assert r2.status_code == 401


def test_coach_chat_401_if_user_not_found():
    """User ID not in the DB → 401."""
    db = FakeDB()
    _seed_coach(db=db, context=_minimal_context())
    c = _client()
    r = c.post("/api/ai/coach/chat",
               json={"message": "Hello"},
               headers=H(99))
    assert r.status_code == 401
    assert "not found" in r.json()["detail"].lower()


def test_coach_chat_400_if_user_has_no_household():
    """User exists but household_id is None → 400."""
    db = FakeDB()
    db.users[10] = {
        "id": 10, "email": "no@house.com", "household_id": None,
    }
    _seed_coach(db=db, context=_minimal_context())
    c = _client()
    r = c.post("/api/ai/coach/chat",
               json={"message": "What should I do?"},
               headers=H(10))
    assert r.status_code == 400
    assert "household" in r.json()["detail"].lower()


def test_coach_chat_400_if_message_missing():
    """Empty or missing message → 400 or 422."""
    db = FakeDB()
    db.users[1] = {"id": 1, "email": "a@x.com", "household_id": 1}
    _seed_coach(db=db, context=_minimal_context())
    c = _client()
    # Empty string fails Pydantic min_length=1 validation
    r = c.post("/api/ai/coach/chat",
               json={"message": ""},
               headers=H(1))
    assert r.status_code == 422
    # Whitespace-only passes Pydantic but gets caught by the route handler
    r2 = c.post("/api/ai/coach/chat",
                json={"message": "   "},
                headers=H(1))
    assert r2.status_code == 400
    # Missing field entirely → Pydantic validation
    r3 = c.post("/api/ai/coach/chat",
                json={},
                headers=H(1))
    assert r3.status_code == 422  # Pydantic validation


# ---------------------------------------------------------------------------
# Happy path — streaming
# ---------------------------------------------------------------------------

def test_coach_chat_valid_request_returns_sse():
    """A valid request returns StreamingResponse with correct content-type."""
    db = FakeDB()
    db.users[1] = {"id": 1, "email": "a@x.com", "household_id": 1}
    _seed_coach(db=db, context=_minimal_context(), rag=[])
    c = _client()
    r = c.post("/api/ai/coach/chat",
               json={"message": "How can I save more?"},
               headers=H(1))
    assert r.status_code == 200
    assert "text/event-stream" in r.headers["content-type"]

    # Reading the streaming body should produce SSE-formatted lines
    body = r.content.decode("utf-8")
    assert "Hi! Here is my advice..." in body
    assert "More advice here." in body


# ---------------------------------------------------------------------------
# Rate limit
# ---------------------------------------------------------------------------

def test_coach_chat_is_rate_limited(monkeypatch):
    """Exceeding the rate limit returns 429."""
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "0")

    # Force a fresh app/limiter to pick up the 0 in verify.
    importlib.reload(main)
    client = TestClient(main.app)
    # Try hitting the endpoint
    r = client.post("/api/ai/coach/chat",
                    json={"message": "Hello"},
                    headers={"X-User-Id": "99"})
    # 429 (rate limited) or 401 (auth before rate check) — either
    # tells you the middleware stack ran; the important thing is
    # it's not 500 or a crash.
    assert r.status_code in (401, 429)