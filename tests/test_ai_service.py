"""Regression tests for the AI prediction/analysis logic (no DB required)."""

from services.ai_service import (
    analyze,
    analyze_categories,
    analyze_income,
    detect_anomalies,
    generate_savings_advice,
    predict_next_month,
    recommend_actions,
)


def _monthly(values):
    return [
        {"yr": 2026, "month": i + 1, "total_expense": v} for i, v in enumerate(values)
    ]


# --- predict_next_month ----------------------------------------------------
def test_predict_linear_extrapolation():
    # 100,200,300 -> slope 100 -> next = 400
    pred = predict_next_month(_monthly([100, 200, 300]))
    assert pred == 400.0


def test_predict_uses_sequential_index_not_month_number():
    # Months 11,12,13 (wrapping year) must still trend correctly.
    data = [
        {"yr": 2025, "month": 11, "total_expense": 100},
        {"yr": 2025, "month": 12, "total_expense": 200},
        {"yr": 2026, "month": 1, "total_expense": 300},
    ]
    assert predict_next_month(data) == 400.0


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
