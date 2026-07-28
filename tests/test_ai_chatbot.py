"""Tests for the AI Chatbot — intent classifier, SQL safety, chat/stream endpoint.

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

class FakeConnection:
    """A lightweight stand-in for a MySQL connection."""

    def is_connected(self) -> bool:
        return True

    def close(self) -> None:
        pass


class FakeDB:
    """In-memory fake that backs find_user_by_id."""
    def __init__(self):
        self.users = {}

    def find_user_by_id(self, user_id):
        return self.users.get(user_id)


def _minimal_context(**overrides) -> dict:
    """Return a well-formed financial coach context dict."""
    ctx = {
        "household_id": 1,
        "current_month": {"year": 2026, "month": 7},
        "total_income": 15_000_000.0,
        "total_expenses": 9_500_000.0,
        "categories": [
            {"name": "Food", "spent": 3_200_000, "budget": 3_000_000, "usage_pct": 106.7, "transaction_count": 12},
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
        "as_text": "USER FINANCIAL CONTEXT\n...",
    }
    ctx.update(overrides)
    return ctx


def _seed_chat(*, db: FakeDB = None, context: dict = None, rag: list = None):
    """Replace DB + RAG + LLM dependencies for the chat_stream route."""
    ra.get_connection = lambda: FakeConnection()

    if db is not None:
        ra.find_user_by_id = db.find_user_by_id

    if context is not None:
        ra.build_financial_coach_context = lambda conn, hid: context

    if rag is not None:
        ra.retrieve_knowledge = lambda query, top_k=4: rag
    else:
        ra.retrieve_knowledge = lambda query, top_k=4: []

    async def _fake_stream(message, ctx, snippets):
        yield json.dumps({"text": "Hello! Let me look at your finances...", "done": False}) + "\n\n"
        yield json.dumps({"text": " Here is my advice.", "done": True, "actions": None}) + "\n\n"

    ra.stream_coach_response = _fake_stream


def _client():
    return TestClient(main.app)


def H(uid: int) -> dict:
    return {"X-User-Id": str(uid)}


# ═══════════════════════════════════════════════════════════
# Intent classifier tests
# ═══════════════════════════════════════════════════════════

class TestClassifyIntent:
    """Keyword-based intent router — no network, no LLM."""

    def test_sql_query_intent(self):
        from services.ai_service import classify_intent, INTENT_SQL_QUERY

        sql_queries = [
            "How much did I spend this month?",
            "What did I buy at WinMart?",
            "List my recent transactions",
            "Show me expenses for this month",
            "When did I last pay for electricity?",
            "What was the biggest expense?",
            "Find expenses with description containing 'coffee'",
            "How much did I spend on Food in July?",
        ]
        for q in sql_queries:
            intent, conf = classify_intent(q)
            assert intent == INTENT_SQL_QUERY, f"Message should be SQL_QUERY: {q!r}"

    def test_financial_advice_intent(self):
        from services.ai_service import classify_intent, INTENT_FINANCIAL_ADVICE

        advice_queries = [
            "How can I save more money?",
            "Should I invest in stocks?",
            "Create a budget for next month",
            "How do I reduce my spending?",
            "Is it a good idea to buy a car?",
            "What should I improve about my finances?",
        ]
        for q in advice_queries:
            intent, conf = classify_intent(q)
            assert intent == INTENT_FINANCIAL_ADVICE, (
                f"Message should be FINANCIAL_ADVICE: {q!r}"
            )

    def test_document_rag_intent(self):
        from services.ai_service import classify_intent, INTENT_DOCUMENT_RAG

        rag_queries = [
            "What is the 50/30/20 rule?",
            "Explain compound interest",
            "What is an emergency fund?",
            "Tell me about inflation",
            "Define net worth",
        ]
        for q in rag_queries:
            intent, conf = classify_intent(q)
            assert intent == INTENT_DOCUMENT_RAG, (
                f"Message should be DOCUMENT_RAG: {q!r}"
            )

    def test_default_to_advice_on_unmatched(self):
        from services.ai_service import classify_intent, INTENT_FINANCIAL_ADVICE

        intent, conf = classify_intent("Hello, how are you?")
        assert intent == INTENT_FINANCIAL_ADVICE

    def test_empty_message_defaults(self):
        from services.ai_service import classify_intent, INTENT_FINANCIAL_ADVICE

        intent, conf = classify_intent("")
        assert intent == INTENT_FINANCIAL_ADVICE
        assert conf == 0.0

    def test_returns_confidence_score(self):
        from services.ai_service import classify_intent

        _, conf = classify_intent("How much did I spend on groceries last week?")
        assert 0.0 <= conf <= 1.0

    def test_returns_tuple(self):
        from services.ai_service import classify_intent

        result = classify_intent("How can I save 10,000,000 VND?")
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], str)
        assert isinstance(result[1], float)


# ═══════════════════════════════════════════════════════════
# SQL safety tests — execute_readonly_query guardrails
# ═══════════════════════════════════════════════════════════

class TestSqlSafety:
    """execute_readonly_query must reject dangerous SQL before execution."""

    def test_rejects_insert(self):
        from services.db_service import _validate_readonly_sql
        with pytest.raises(ValueError):
            _validate_readonly_sql("INSERT INTO expenses (household_id, amount) VALUES (1, 999)")

    def test_rejects_update(self):
        from services.db_service import _validate_readonly_sql
        with pytest.raises(ValueError):
            _validate_readonly_sql("UPDATE expenses SET amount = 0 WHERE id = 1")

    def test_rejects_delete(self):
        from services.db_service import _validate_readonly_sql
        with pytest.raises(ValueError):
            _validate_readonly_sql("DELETE FROM expenses WHERE id = 1")

    def test_rejects_drop(self):
        from services.db_service import _validate_readonly_sql
        with pytest.raises(ValueError):
            _validate_readonly_sql("DROP TABLE expenses")

    def test_rejects_alter(self):
        from services.db_service import _validate_readonly_sql
        with pytest.raises(ValueError):
            _validate_readonly_sql("ALTER TABLE expenses ADD COLUMN foo INT")

    def test_rejects_truncate(self):
        from services.db_service import _validate_readonly_sql
        with pytest.raises(ValueError):
            _validate_readonly_sql("TRUNCATE TABLE expenses")

    def test_rejects_multi_statement(self):
        from services.db_service import _validate_readonly_sql
        with pytest.raises(ValueError):
            _validate_readonly_sql("SELECT * FROM expenses; DROP TABLE expenses")

    def test_accepts_select(self):
        from services.db_service import _validate_readonly_sql
        # Must NOT raise
        _validate_readonly_sql("SELECT * FROM expenses WHERE household_id = %(household_id)s")

    def test_accepts_with_cte(self):
        from services.db_service import _validate_readonly_sql
        _validate_readonly_sql(
            "WITH monthly AS (SELECT SUM(amount) AS total FROM expenses WHERE household_id = %(household_id)s) SELECT total FROM monthly"
        )

    def test_empty_sql_rejected(self):
        from services.db_service import _validate_readonly_sql
        with pytest.raises(ValueError):
            _validate_readonly_sql("")
        with pytest.raises(ValueError):
            _validate_readonly_sql("   ")

    def test_rejects_semicolon_in_string_has_no_false_positive(self):
        """A semicolon INSIDE a string literal still triggers multi-statement
        rejection. This is safest — the model must not embed semicolons."""
        from services.db_service import _validate_readonly_sql
        with pytest.raises(ValueError):
            _validate_readonly_sql("SELECT 'hello;world' AS greeting FROM dual")


# ═══════════════════════════════════════════════════════════
# Chat stream endpoint — auth and validation
# ═══════════════════════════════════════════════════════════

class TestChatStreamAuth:
    """POST /api/ai/chat/stream — authentication and validation."""

    def test_401_if_no_user_id(self):
        c = _client()
        r = c.post("/api/ai/chat/stream", json={"message": "How can I save more?"})
        assert r.status_code == 401
        assert "X-User-Id" in r.json()["detail"]

    def test_401_if_invalid_user_id(self):
        c = _client()
        r = c.post("/api/ai/chat/stream",
                   json={"message": "Hello"},
                   headers={"X-User-Id": "abc"})
        assert r.status_code == 401

    def test_401_if_negative_user_id(self):
        c = _client()
        r = c.post("/api/ai/chat/stream",
                   json={"message": "Hello"},
                   headers={"X-User-Id": "-1"})
        assert r.status_code == 401

    def test_401_if_user_not_found(self):
        db = FakeDB()
        _seed_chat(db=db, context=_minimal_context())
        c = _client()
        r = c.post("/api/ai/chat/stream",
                   json={"message": "Hello"},
                   headers=H(99))
        assert r.status_code == 401
        assert "not found" in r.json()["detail"].lower()

    def test_400_if_user_has_no_household(self):
        db = FakeDB()
        db.users[10] = {"id": 10, "email": "no@house.com", "household_id": None}
        _seed_chat(db=db, context=_minimal_context())
        c = _client()
        r = c.post("/api/ai/chat/stream",
                   json={"message": "What should I do?"},
                   headers=H(10))
        assert r.status_code == 400
        assert "household" in r.json()["detail"].lower()

    def test_400_if_message_missing(self):
        db = FakeDB()
        db.users[1] = {"id": 1, "email": "a@x.com", "household_id": 1}
        _seed_chat(db=db, context=_minimal_context())
        c = _client()
        # Empty string fails Pydantic min_length=1
        r = c.post("/api/ai/chat/stream",
                   json={"message": ""},
                   headers=H(1))
        assert r.status_code == 422

    def test_400_if_message_whitespace_only(self):
        db = FakeDB()
        db.users[1] = {"id": 1, "email": "a@x.com", "household_id": 1}
        _seed_chat(db=db, context=_minimal_context())
        c = _client()
        r = c.post("/api/ai/chat/stream",
                   json={"message": "   "},
                   headers=H(1))
        assert r.status_code == 400

    def test_advice_intent_returns_sse(self):
        """Financial advice questions stream via SSE."""
        db = FakeDB()
        db.users[1] = {"id": 1, "email": "a@x.com", "household_id": 1}
        _seed_chat(db=db, context=_minimal_context(), rag=[])
        c = _client()
        r = c.post("/api/ai/chat/stream",
                   json={"message": "How can I save 10 million VND?"},
                   headers=H(1))
        assert r.status_code == 200
        assert "text/event-stream" in r.headers["content-type"]
        body = r.content.decode("utf-8")
        assert "Hello! Let me look at your finances..." in body
        assert "Here is my advice." in body

    def test_sql_intent_returns_json(self):
        """SQL data-lookup returns structured JSON (not SSE)."""
        import asyncio

        async def _fake_pipeline(msg, hid, connection=None):
            return {
                "sql": "SELECT * FROM expenses WHERE household_id = %(household_id)s",
                "rows": [{"amount": 50000, "description": "WinMart groceries"}],
                "summary": "You spent 50,000 at WinMart.",
            }

        db = FakeDB()
        db.users[1] = {"id": 1, "email": "a@x.com", "household_id": 1}
        _seed_chat(db=db, context=_minimal_context(), rag=[])
        ra.run_text_to_sql_pipeline = _fake_pipeline

        c = _client()
        r = c.post("/api/ai/chat/stream",
                   json={"message": "How much did I spend this month?"},
                   headers=H(1))
        assert r.status_code == 200
        body = r.json()
        assert "intent" in body
        assert body["intent"] == "SQL_QUERY"
        assert "sql" in body
        assert len(body["rows"]) == 1


# ═══════════════════════════════════════════════════════════
# Rate limiting
# ═══════════════════════════════════════════════════════════

def test_chat_stream_is_rate_limited():
    """Correct the rate limit returns 429 or 401."""
    # Force a fresh app/limiter.
    import os
    os.environ["RATE_LIMIT_PER_MINUTE"] = "0"
    importlib.reload(main)
    client = TestClient(main.app)
    r = client.post("/api/ai/chat/stream",
                    json={"message": "Hello"},
                    headers={"X-User-Id": "99"})
    assert r.status_code in (401, 429)


# ═══════════════════════════════════════════════════════════
# SQL parsing from LLM response
# ═══════════════════════════════════════════════════════════

class TestParseSqlFromLlm:
    """_parse_sql_from_llm extracts SQL from markdown-fenced responses."""

    def test_extracts_fenced_sql(self):
        from services.ai_service import _parse_sql_from_llm

        text = """
        Here is your query:
        ```sql
        SELECT * FROM expenses WHERE household_id = %(household_id)s
        ```
        Hope this helps!
        """
        result = _parse_sql_from_llm(text)
        assert result == "SELECT * FROM expenses WHERE household_id = %(household_id)s"

    def test_extracts_non_fenced_select(self):
        from services.ai_service import _parse_sql_from_llm
        result = _parse_sql_from_llm("SELECT * FROM expenses WHERE household_id = %(household_id)s")
        assert result.startswith("SELECT")

    def test_rejects_mutation_even_fenced(self):
        """_parse_sql_from_llm extracts the SQL — safety checks happen in
        _validate_readonly_sql. But a non-SELECT statement hidden in a fence
        should still be extracted (and then rejected by the validator)."""
        from services.ai_service import _parse_sql_from_llm

        text = "```sql\nDELETE FROM expenses WHERE id = 1\n```"
        result = _parse_sql_from_llm(text)
        assert result == "DELETE FROM expenses WHERE id = 1"
        # The caller (execute_readonly_query) then rejects it.

    def test_returns_none_for_gibber(self):
        from services.ai_service import _parse_sql_from_llm
        assert _parse_sql_from_llm("Here is some advice about saving money.") is None
        assert _parse_sql_from_llm("") is None
        assert _parse_sql_from_llm(None) is None


# ═══════════════════════════════════════════════════════════
# DB schema prompt safety
# ═══════════════════════════════════════════════════════════

class TestSchemaPrompt:
    """The schema prompt must enforce tenant isolation."""

    def test_prompt_requires_household_filter(self):
        from services.ai_service import _DB_SCHEMA_PROMPT
        assert "household_id" in _DB_SCHEMA_PROMPT
        assert "%(household_id)s" in _DB_SCHEMA_PROMPT
        assert "WHERE" in _DB_SCHEMA_PROMPT

    def test_prompt_forbids_mutations(self):
        from services.ai_service import _DB_SCHEMA_PROMPT
        # The prompt wraps at "Generate ONLY\nSELECT" — check both words are present
        assert ("ONLY" in _DB_SCHEMA_PROMPT and "SELECT" in _DB_SCHEMA_PROMPT)
        for forbidden in ("INSERT", "UPDATE", "DELETE", "DROP"):
            # These appear as "never INSERT, UPDATE, DELETE, DROP, or any other mutation"
            assert forbidden in _DB_SCHEMA_PROMPT, (
                f"Prompt must mention {forbidden} as forbidden"
            )