"""Regression tests for the AI prediction/analysis logic (no DB required)."""

from services.ai_service import (
    analyze,
    analyze_categories,
    analyze_income,
    detect_anomalies,
    generate_savings_advice,
    predict_next_month,
    recommend_actions,
    suggest_cutbacks,
    evaluate_alert_thresholds,
)


def _monthly(values):
    return [
        {"yr": 2026, "month": i + 1, "total_expense": v} for i, v in enumerate(values)
    ]


# --- predict_next_month (RAG, falls back to linear regression) ------------
def test_predict_fallback_uses_linear_regression():
    # No ANTHROPIC_API_KEY in the test env -> deterministic LR fallback.
    # 100,200,300 -> slope 100 -> next = 400
    pred = predict_next_month(_monthly([100, 200, 300]))
    assert pred["predicted"] == 400.0
    assert pred["method"] == "fallback_linear_regression"


def test_predict_fallback_sequential_index_not_month_number():
    # Months 11,12,13 (wrapping year) must still trend correctly.
    data = [
        {"yr": 2025, "month": 11, "total_expense": 100},
        {"yr": 2025, "month": 12, "total_expense": 200},
        {"yr": 2026, "month": 1, "total_expense": 300},
    ]
    pred = predict_next_month(data)
    assert pred["predicted"] == 400.0


def test_predict_fallback_uses_holt_for_longer_series():
    # 6+ points should use Holt (trend-aware), not plain linear regression.
    data = _monthly([100, 200, 300, 400, 500, 600])
    pred = predict_next_month(data)
    assert pred["method"] == "fallback_holt"
    # Captures the upward trend (predicts above the last actual point).
    assert pred["predicted"] > 600


def test_predict_fallback_holt_flat_series_stable():
    # A flat series should forecast roughly the same level (no wild swing).
    data = _monthly([500, 500, 500, 500, 500, 500, 500])
    pred = predict_next_month(data)
    assert pred["method"] == "fallback_holt"
    assert 400 <= pred["predicted"] <= 600


def test_deterministic_forecast_dispatcher_lengths():
    from services.ai_service import deterministic_forecast

    # < 2 points -> fallback_none, 0.0
    assert deterministic_forecast([{"total_expense": 100}], "total_expense") == (0.0, "fallback_none")
    # 2..5 points -> linear regression (preserves the 400 test)
    assert deterministic_forecast(_monthly([100, 200, 300]), "total_expense")[1] == "fallback_linear_regression"
    # >= 6 points -> holt
    assert deterministic_forecast(_monthly([1, 2, 3, 4, 5, 6]), "total_expense")[1] == "fallback_holt"


def test_forecast_category_breakdown():
    from services.ai_service import forecast_category_breakdown

    rows = [
        {"category_name": "Food", "yr": 2026, "month": 1, "total": 100},
        {"category_name": "Food", "yr": 2026, "month": 2, "total": 110},
        {"category_name": "Food", "yr": 2026, "month": 3, "total": 120},
        {"category_name": "Rent", "yr": 2026, "month": 1, "total": 500},
        {"category_name": "Rent", "yr": 2026, "month": 2, "total": 500},
        {"category_name": "Rent", "yr": 2026, "month": 3, "total": 500},
    ]
    out = forecast_category_breakdown(rows)
    names = {c["category"] for c in out}
    assert names == {"Food", "Rent"}
    food = next(c for c in out if c["category"] == "Food")
    assert food["predicted"] > food["last"]  # upward trend captured
    rent = next(c for c in out if c["category"] == "Rent")
    assert rent["predicted"] == 500.0  # flat series stable



def test_rag_uses_valid_tool_choice_shape(monkeypatch):
    # Regression guard: the forced tool_choice must be {"type": "tool", ...},
    # NOT {"type": "tool_choice", ...} (which the API rejects with 400 and
    # would silently fall back to linear regression).
    captured: dict = {}

    class _ToolUse:
        type = "tool_use"
        input = {
            "predicted": 123.0,
            "explanation": "e",
            "suggestions": ["s"],
            "confidence": "high",
        }

    class _Resp:
        stop_reason = "tool_use"
        content = [_ToolUse()]

    class _Messages:
        def create(self, **kw):
            captured.update(kw)
            return _Resp()

    class _Client:
        def __init__(self, *a, **k):
            self.messages = _Messages()

    import anthropic

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(anthropic, "Anthropic", _Client)

    data = [{"yr": 2026, "month": i + 1, "total_expense": v} for i, v in enumerate([100, 200, 300])]
    res = predict_next_month(data)

    assert res["method"] == "rag"
    assert captured["tool_choice"] == {
        "type": "tool",
        "name": "report_prediction",
    }, captured.get("tool_choice")
    assert captured["tools"][0]["strict"] is True


# --- analyze --------------------------------------------------------------
def test_analyze_warning_when_over_budget():
    a = analyze(predicted=120, last_month=100, budget=100)
    assert a["status"] == "warning"
    assert a["increase_percent"] == 20.0


def test_analyze_abnormal_when_increase_over_20pct():
    a = analyze(predicted=130, last_month=100, budget=200)
    assert a["status"] == "abnormal"


def test_analyze_normal():
    a = analyze(predicted=110, last_month=100, budget=200)
    assert a["status"] == "normal"


def test_analyze_zero_last_month_no_division_error():
    a = analyze(predicted=0, last_month=0, budget=None)
    assert a["increase_percent"] == 0.0


# --- analyze_income -------------------------------------------------------
def test_analyze_income_positive():
    a = analyze_income(predicted=120, last_month=100)
    assert a["status"] == "positive"


def test_analyze_income_warning_on_drop():
    a = analyze_income(predicted=80, last_month=100)
    assert a["status"] == "warning"


# --- analyze_categories ---------------------------------------------------
def test_analyze_categories_detects_overspend():
    cats = [{"category_name": "Food", "total": 120, "transaction_count": 3}]
    buds = [{"category_name": "Food", "budget_amount": 100}]
    out = analyze_categories(cats, buds, total_expense=120)
    assert len(out["overspent_categories"]) == 1
    assert out["total_budget"] == 100
    types = [s["type"] for s in out["suggestions"]]
    assert "overspent" in types


# --- detect_anomalies (median-relative) -----------------------------------
def test_detect_anomalies_flags_high_outlier():
    data = _monthly([100, 110, 105, 5000])
    an = detect_anomalies(data)
    assert len(an) == 1
    assert an[0]["direction"] == "high"
    assert an[0]["month"] == "2026-04"


def test_detect_anomalies_none_for_stable_series():
    data = _monthly([100, 102, 101, 99, 100])
    assert detect_anomalies(data) == []


def test_detect_anomalies_needs_at_least_3():
    assert detect_anomalies(_monthly([100, 200])) == []


# --- generate_savings_advice ----------------------------------------------
def test_savings_surplus():
    s = generate_savings_advice(predicted_expense=100, predicted_income=150, budget=None)
    assert s["status"] == "surplus"
    assert s["surplus"] == 50


def test_savings_deficit():
    s = generate_savings_advice(predicted_expense=300, predicted_income=100, budget=None)
    assert s["status"] == "deficit"


def test_savings_break_even():
    s = generate_savings_advice(predicted_expense=100, predicted_income=100, budget=None)
    assert s["status"] == "break_even"


def test_savings_no_budget_without_income():
    s = generate_savings_advice(predicted_expense=100, predicted_income=None, budget=None)
    assert s["status"] == "no_budget"


def test_savings_over_budget_without_income():
    s = generate_savings_advice(predicted_expense=200, predicted_income=None, budget=100)
    assert s["status"] == "over_budget"


# --- recommend_actions ----------------------------------------------------
def test_recommend_actions_prioritizes_high():
    analysis = {"status": "warning", "message": "m", "suggestion": "s"}
    cat = {"overspent_categories": [{"name": "Food", "over_amount": 10, "budget_usage": 120}]}
    acts = recommend_actions(analysis, cat, anomalies=[], savings={"status": "surplus", "tip": "t"})
    assert acts[0]["priority"] == "high"
    assert acts[0]["type"] == "budget"


def test_recommend_actions_includes_anomaly():
    analysis = {"status": "normal", "message": "", "suggestion": ""}
    anomalies = [{"month": "2026-04", "direction": "high", "amount": 5000, "deviation_percent": 4000}]
    acts = recommend_actions(analysis, {"overspent_categories": []}, anomalies, {"status": "no_budget", "tip": ""})
    assert any(a["type"] == "anomaly" for a in acts)


# --- suggest_cutbacks -----------------------------------------------------
def test_suggest_cutbacks_returns_excess_per_lever():
    cats = [
        {"name": "Food", "spent": 120, "budget": 100, "over_amount": 20, "budget_usage": 120},
        {"name": "Rent", "spent": 500, "budget": 500, "over_amount": 0, "budget_usage": 100},
        {"name": "Fun", "spent": 30, "budget": 50, "over_amount": 0, "budget_usage": 60},
    ]
    out = suggest_cutbacks(cats)
    assert out["count"] == 1
    assert out["total_potential_saving"] == 20
    assert out["levers"][0]["lever"] == "Food"
    assert out["levers"][0]["suggested_cutback"] == 20
    assert out["levers"][0]["projected_spent"] == 100


def test_suggest_cutbacks_skips_categories_without_budget():
    cats = [{"name": "Misc", "spent": 999, "budget": None}]
    out = suggest_cutbacks(cats)
    assert out["count"] == 0
    assert out["total_potential_saving"] == 0


# --- evaluate_alert_thresholds --------------------------------------------
def test_alert_triggers_when_usage_over_threshold():
    cats = [
        {"name": "Food", "spent": 90, "budget": 100, "budget_usage": 90},
        {"name": "Rent", "spent": 500, "budget": 500, "budget_usage": 100},
    ]
    out = evaluate_alert_thresholds(cats, {}, default_threshold=80)
    # Food 90% >= 80 -> warning; Rent 100% >= 80 -> high (>=100)
    assert out["triggered_count"] == 2
    by_lever = {a["lever"]: a for a in out["alerts"]}
    assert by_lever["Food"]["severity"] == "warning"
    assert by_lever["Rent"]["severity"] == "high"


def test_alert_per_lever_override_beats_default():
    cats = [
        {"name": "Food", "spent": 85, "budget": 100, "budget_usage": 85},
        {"name": "Fun", "spent": 50, "budget": 100, "budget_usage": 50},
    ]
    # default 80 would flag Food; per-lever override 95 for Food -> no alert.
    out = evaluate_alert_thresholds(
        cats, {"Food": 95}, default_threshold=80
    )
    assert out["triggered_count"] == 0


def test_alert_no_default_means_only_specified_levers_checked():
    cats = [{"name": "Food", "spent": 90, "budget": 100, "budget_usage": 90}]
    out = evaluate_alert_thresholds(cats, {}, default_threshold=None)
    assert out["triggered_count"] == 0
    assert out["total_evaluated"] == 1
