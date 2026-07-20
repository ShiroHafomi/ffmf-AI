"""Tests for the RAG retrieval layer (offline, no LLM/network)."""

from services.rag_retriever import (
    FINANCIAL_KNOWLEDGE_BASE,
    build_knowledge_query,
    retrieve_knowledge,
)


def test_corpus_is_nonempty():
    assert len(FINANCIAL_KNOWLEDGE_BASE) >= 10


def test_retrieve_returns_top_k_and_never_raises():
    out = retrieve_knowledge("overspent groceries subscription", top_k=3)
    assert len(out) == 3
    assert all(isinstance(s, str) and s for s in out)


def test_retrieve_grocery_query_ranks_grocery_snippet():
    out = retrieve_knowledge("groceries meal plan bulk shopping list", top_k=4)
    # The groceries snippet should be among the top results.
    assert any("Groceries are usually the most flexible" in s for s in out)


def test_retrieve_over_budget_query_ranks_budget_snippets():
    out = retrieve_knowledge("over budget warning rent housing fixed cost", top_k=4)
    assert any("rent" in s.lower() or "budget" in s.lower() for s in out)


def test_retrieve_empty_query_falls_back_to_corpus_prefix():
    out = retrieve_knowledge("", top_k=2)
    assert out == FINANCIAL_KNOWLEDGE_BASE[:2]


def test_build_knowledge_query_signals_trend_and_overspend():
    data = [
        {"yr": 2026, "month": 1, "total_expense": 100},
        {"yr": 2026, "month": 2, "total_expense": 200},
    ]
    cats = [
        {"category_name": "Food", "total": 120, "budget_amount": 100},
    ]
    q = build_knowledge_query(data, "total_expense", cats, budget=150, kind="expense")
    assert "increasing" in q
    assert "over budget" in q
    assert "food" in q and "overspent" in q


def test_build_knowledge_query_flat_trend_no_crash():
    data = [{"yr": 2026, "month": 1, "total_expense": 100}]
    q = build_knowledge_query(data, "total_expense", None, budget=None, kind="expense")
    assert "forecast" in q
