"""Offline tests for the RAG forecasting service (no LLM / no network / no DB).

These pin the deterministic behaviour that the whole service falls back to, the
structured-output guards in ``_finalize_rag``, and the analysis helpers. The LLM
providers are never called: tests force ``LLM_PROVIDER=deterministic`` where the
generation path would otherwise run.
"""

import pytest

from services import ai_service
from services.ai_service import (
    _build_retrieval_context,
    _finalize_rag,
    _season_label,
    analyze,
    analyze_categories,
    analyze_income,
    deterministic_forecast,
    detect_anomalies,
    evaluate_alert_thresholds,
    forecast_category_breakdown,
    generate_savings_advice,
    holt_forecast,
    linear_regression_predict,
    predict_next_month,
    rag_predict,
    suggest_cutbacks,
)


def _series(values, start_month=1, yr=2026):
    """Build monthly expense rows from a list of totals."""
    rows = []
    m, y = start_month, yr
    for v in values:
        rows.append({"yr": y, "month": m, "total_expense": float(v)})
        m += 1
        if m > 12:
            m = 1
            y += 1
    return rows


@pytest.fixture(autouse=True)
def _force_deterministic(monkeypatch):
    """Never hit an LLM in unit tests."""
    monkeypatch.setenv("LLM_PROVIDER", "deterministic")


# ───────────────────────── deterministic models ─────────────────────────
def test_linear_regression_extrapolates_linear_series():
    data = _series([100, 200, 300])
    assert linear_regression_predict(data) == pytest.approx(400.0, abs=1e-6)


def test_deterministic_forecast_model_selection_by_length():
    _, m2 = deterministic_forecast(_series([100, 120]))
    assert m2 == "fallback_linear_regression"

    _, m6 = deterministic_forecast(_series([1, 2, 3, 4, 5, 6]))
    assert m6 == "fallback_holt"

    _, m12 = deterministic_forecast(_series(list(range(1, 13))))
    assert m12 == "fallback_holt_seasonal"


def test_deterministic_forecast_empty_and_single():
    assert deterministic_forecast([]) == (0.0, "fallback_none")
    assert deterministic_forecast(_series([500])) == (0.0, "fallback_none")


def test_holt_tracks_upward_trend():
    out = holt_forecast([100, 110, 120, 130])
    assert out > 130


# ───────────────────────── _finalize_rag guards ─────────────────────────
def _valid_tool_input(predicted=1000):
    return {
        "predicted": predicted,
        "explanation": "Stable trend near the recent average.",
        "suggestions": ["Trim dining out", "Audit subscriptions"],
        "confidence": "high",
    }


def test_finalize_rag_accepts_valid_input():
    data = _series([900, 950, 1000, 1050])
    out = _finalize_rag(_valid_tool_input(1100), data, "total_expense", "")
    assert out["method"] == "rag"
    assert out["predicted"] == 1100.0
    assert out["confidence"] == "high"
    assert len(out["suggestions"]) <= 3


def test_finalize_rag_rejects_out_of_range():
    data = _series([100, 100, 100, 100])
    out = _finalize_rag(_valid_tool_input(999999), data, "total_expense", "")
    assert out["method"].startswith("fallback")


def test_finalize_rag_rejects_negative():
    data = _series([100, 100, 100])
    out = _finalize_rag(_valid_tool_input(-5), data, "total_expense", "")
    assert out["method"].startswith("fallback")


def test_finalize_rag_rejects_unparseable_predicted():
    data = _series([100, 100, 100])
    out = _finalize_rag({"predicted": "not-a-number"}, data, "total_expense", "")
    assert out["method"].startswith("fallback")


def test_finalize_rag_rejects_malformed_suggestions():
    data = _series([100, 100, 100])
    bad = _valid_tool_input(110)
    bad["suggestions"] = "should-be-a-list"
    out = _finalize_rag(bad, data, "total_expense", "")
    assert out["method"].startswith("fallback")


def test_finalize_rag_defaults_unknown_confidence():
    data = _series([100, 100, 100])
    inp = _valid_tool_input(110)
    inp["confidence"] = "extreme"
    out = _finalize_rag(inp, data, "total_expense", "")
    assert out["confidence"] == "medium"


# ───────────────────────── orchestrator (deterministic) ─────────────────────────
def test_rag_predict_deterministic_mode_never_calls_llm():
    data = _series([100, 200, 300, 400])
    out = rag_predict(data, amount_key="total_expense")
    assert out["method"].startswith("fallback")
    assert "predicted" in out and out["predicted"] >= 0


def test_rag_predict_enriches_suggestions_from_retrieval():
    data = _series([100, 200, 300, 400])
    cats = [{"category_name": "Groceries", "total": 500, "budget_amount": 300}]
    out = rag_predict(data, category_context=cats, budget=350)
    # Even offline, retrieval should surface at least one suggestion.
    assert isinstance(out["suggestions"], list)
    assert len(out["suggestions"]) >= 1


def test_rag_predict_not_enough_history():
    out = rag_predict(_series([100]), amount_key="total_expense")
    assert out["method"] == "fallback_none"


def test_predict_next_month_income_key():
    rows = [{"yr": 2026, "month": i, "total_income": 1000 + i} for i in range(1, 5)]
    out = predict_next_month(rows, amount_key="total_income")
    assert out["predicted"] >= 0


# ───────────────────────── context builder ─────────────────────────
def test_build_retrieval_context_includes_signals():
    data = _series([100, 200, 300, 400])
    ctx = _build_retrieval_context(
        data, "total_expense", None, budget=350, kind="expense",
        retrieved_knowledge=["Audit subscriptions monthly."],
    )
    assert "SUMMARY" in ctx
    assert "trend_slope_pct" in ctx
    assert "RETRIEVED FINANCIAL KNOWLEDGE" in ctx
    assert "report_prediction" in ctx


def test_season_label_known_months():
    assert "holiday" in _season_label(12)
    assert _season_label(8) == "back-to-school season"


# ───────────────────────── analysis helpers ─────────────────────────
def test_analyze_flags_budget_and_spike():
    warn = analyze(predicted=1200, last_month=1000, budget=1000)
    assert warn["status"] in ("warning", "abnormal")

    abnormal = analyze(predicted=1500, last_month=1000, budget=None)
    assert abnormal["status"] == "abnormal"

    normal = analyze(predicted=1000, last_month=1000, budget=2000)
    assert normal["status"] == "normal"


def test_analyze_income_directions():
    assert analyze_income(1200, 1000)["status"] == "positive"
    assert analyze_income(800, 1000)["status"] == "warning"
    assert analyze_income(1000, 1000)["status"] == "normal"


def test_detect_anomalies_finds_spike():
    data = _series([100, 100, 100, 1000, 100])
    out = detect_anomalies(data, amount_key="total_expense")
    assert any(a["direction"] == "high" for a in out)


def test_analyze_categories_and_cutbacks():
    cat_exp = [
        {"category_name": "Food", "total": 500, "transaction_count": 10},
        {"category_name": "Rent", "total": 300, "transaction_count": 1},
    ]
    cat_bud = [
        {"category_name": "Food", "budget_amount": 300},
        {"category_name": "Rent", "budget_amount": 300},
    ]
    analysis = analyze_categories(cat_exp, cat_bud, total_expense=800)
    assert any(c["name"] == "Food" for c in analysis["overspent_categories"])

    cutbacks = suggest_cutbacks(analysis["categories"])
    assert cutbacks["total_potential_saving"] == pytest.approx(200.0)
    assert cutbacks["count"] == 1


def test_evaluate_alert_thresholds():
    cats = [{"name": "Food", "spent": 280, "budget": 300, "budget_usage": 93.3}]
    out = evaluate_alert_thresholds(cats, {}, default_threshold=80)
    assert out["triggered_count"] == 1


def test_generate_savings_advice_states():
    assert generate_savings_advice(800, 1000, None)["status"] == "surplus"
    assert generate_savings_advice(1200, 1000, None)["status"] == "deficit"
    assert generate_savings_advice(1200, None, 1000)["status"] == "over_budget"


def test_forecast_category_breakdown():
    rows = [
        {"category_name": "Food", "yr": 2026, "month": 1, "total": 100},
        {"category_name": "Food", "yr": 2026, "month": 2, "total": 200},
        {"category_name": "Food", "yr": 2026, "month": 3, "total": 300},
    ]
    out = forecast_category_breakdown(rows)
    assert out and out[0]["category"] == "Food"
    assert out[0]["predicted"] >= 0


def test_rag_fallback_survives_broken_deterministic(monkeypatch):
    """Even if the deterministic model raises, the service returns a valid dict."""
    def boom(*a, **k):
        raise RuntimeError("model exploded")

    monkeypatch.setattr(ai_service, "deterministic_forecast", boom)
    out = ai_service._rag_fallback(_series([100, 200, 300]), "total_expense", "test")
    assert out["predicted"] == 0.0
    assert out["method"] == "fallback_error"
