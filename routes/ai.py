"""AI-powered endpoints — forecast, anomaly, savings plan, budget optimizer, category insights."""

from fastapi import APIRouter, HTTPException, Request
from typing import Optional

from db.connection import get_connection
from services import cache
from services.limiter import limiter, DEFAULT_LIMIT
from services.db_service import (
    get_monthly_expenses,
    get_monthly_incomes,
    get_latest_budget,
    get_category_expenses,
    get_category_budgets,
    get_monthly_category_expenses,
)
from services.ai_service import (
    predict_next_month,
    analyze,
    analyze_categories,
    analyze_income,
    detect_anomalies,
    generate_savings_advice,
    recommend_actions,
    suggest_cutbacks,
    evaluate_alert_thresholds,
    forecast_category_breakdown,
    backtest_forecast,
    ensemble_forecast,
    holt_winters_forecast,
    trend_analysis,
    residual_based_interval,
    deterministic_forecast,
)
from services.validation import (
    validate_household_id,
    validate_threshold,
    handle_db_error,
)
from services.schemas import (
    ForecastResponse,
    AnomalyResponse,
    SavingsPlanResponse,
    BudgetOptimizerResponse,
    CategoryInsightsResponse,
    ErrorResponse,
)

router = APIRouter(tags=["AI-Powered"])


@router.get(
    "/forecast/{household_id}",
    summary="Multi-month expense forecast",
    response_description="Forecast for the next N months with intervals and model diagnostics.",
    responses={
        200: {"model": ForecastResponse, "description": "Multi-month forecast."},
        400: {"model": ErrorResponse, "description": "Invalid household_id or not enough history."},
        404: {"model": ErrorResponse, "description": "No expense data."},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded."},
        500: {"model": ErrorResponse, "description": "Database error."},
    },
)
@limiter.limit(DEFAULT_LIMIT)
def forecast(
    request: Request,
    household_id: int,
    months: int = 3,
    threshold: float = 80,
    category_thresholds: Optional[str] = None,
):
    """Forecast expenses for the **next N months** using the ensemble forecaster.

    Each month is predicted sequentially (last prediction feeds into the next).
    Returns per-month point estimates, prediction intervals, model used,
    confidence, and walk-forward backtest quality.

    - **months**: number of future months to forecast (1-12, default 3).
    - **threshold**: default budget-usage alert threshold (%), clamped to 0-100.
    - **category_thresholds**: optional per-lever overrides, e.g. `Food:80,Rent:95`.
    """
    validate_household_id(household_id)
    months = max(1, min(int(months), 12))
    threshold = validate_threshold(threshold)

    cache_key = cache.make_key(
        "forecast", household_id, months, threshold, category_thresholds
    )
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    conn = None
    try:
        try:
            conn = get_connection()
        except ConnectionError as e:
            handle_db_error("get_connection", e)

        expenses = get_monthly_expenses(household_id, connection=conn)
        if not expenses:
            raise HTTPException(
                status_code=404,
                detail=f"Không tìm thấy dữ liệu chi tiêu cho household_id={household_id}",
            )
        if len(expenses) < 3:
            raise HTTPException(
                status_code=400,
                detail=f"Không đủ dữ liệu. Cần ít nhất 3 tháng, hiện có {len(expenses)} tháng.",
            )

        budget = get_latest_budget(household_id, connection=conn)

        # Category context for RAG enrichment (best-effort).
        category_expenses: list[dict] = []
        category_budgets: list[dict] = []
        try:
            category_expenses = get_category_expenses(household_id, connection=conn)
            category_budgets = get_category_budgets(household_id, connection=conn)
        except Exception:
            pass
        current_month_total = (
            sum(float(c["total"]) for c in category_expenses) if category_expenses else 0
        )

        # Build multi-month forecast sequentially.
        forecasts: list[dict] = []
        working_data = list(expenses)
        for i in range(months):
            pred_res = predict_next_month(
                working_data,
                amount_key="total_expense",
                category_context=category_expenses,
                budget=budget,
            )
            pred = float(pred_res["predicted"])
            interval = pred_res.get("interval")
            last = float(working_data[-1]["total_expense"])
            analysis = analyze(pred, last, budget, interval=interval)

            forecasts.append(
                {
                    "month_offset": i + 1,
                    "predicted": pred,
                    "interval": interval,
                    "increase_percent": analysis["increase_percent"],
                    "status": analysis["status"],
                    "message": analysis["message"],
                    "suggestion": analysis["suggestion"],
                    "method": pred_res.get("method"),
                    "confidence": pred_res.get("confidence"),
                    "explanation": pred_res.get("explanation"),
                    "suggestions": pred_res.get("suggestions", []),
                }
            )
            # Append the prediction as a synthetic data point for the next iteration.
            last_month_val = int(working_data[-1].get("month", 0))
            last_year_val = int(working_data[-1].get("yr", 0))
            next_month = (last_month_val % 12) + 1
            next_year = last_year_val + (1 if next_month == 1 else 0)
            working_data.append(
                {
                    "yr": next_year,
                    "month": next_month,
                    "total_expense": pred,
                }
            )

        # Backtest quality for the ensemble.
        quality = backtest_forecast(expenses, amount_key="total_expense")

        # Income prediction if available.
        incomes = []
        try:
            incomes = get_monthly_incomes(household_id, connection=conn)
        except Exception:
            incomes = []

        predicted_income = None
        if incomes and len(incomes) >= 3:
            inc_res = predict_next_month(incomes, amount_key="total_income")
            predicted_income = float(inc_res["predicted"])

        result = {
            "household_id": household_id,
            "months_forecast": months,
            "forecasts": forecasts,
            "forecast_quality": quality,
            "predicted_income": predicted_income,
        }

        cache.set(cache_key, result)
        return result
    finally:
        if conn is not None and conn.is_connected():
            conn.close()


@router.get(
    "/anomaly/{household_id}",
    summary="Dedicted anomaly detection",
    response_description="List of anomalous spending months with deviation analysis.",
    responses={
        200: {"model": AnomalyResponse, "description": "Anomaly detection results."},
        400: {"model": ErrorResponse, "description": "Invalid household_id."},
        404: {"model": ErrorResponse, "description": "No expense data."},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded."},
        500: {"model": ErrorResponse, "description": "Database error."},
    },
)
@limiter.limit(DEFAULT_LIMIT)
def anomaly_detection(
    request: Request,
    household_id: int,
    rel_threshold: float = 1.8,
):
    """Detect months with **anomalous spending** using the median-based
    outlier detector with configurable sensitivity.

    - **rel_threshold**: multiplier on the median — amounts exceeding
      `median * rel_threshold` or falling below `median / rel_threshold`
      are flagged. Default 1.8 (tune higher for fewer alerts).
    """
    validate_household_id(household_id)
    rel_threshold = max(1.0, min(float(rel_threshold), 5.0))

    cache_key = cache.make_key("anomaly", household_id, rel_threshold)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    conn = None
    try:
        try:
            conn = get_connection()
        except ConnectionError as e:
            handle_db_error("get_connection", e)

        expenses = get_monthly_expenses(household_id, connection=conn)
        if not expenses:
            raise HTTPException(
                status_code=404,
                detail=f"Không tìm thấy dữ liệu chi tiêu cho household_id={household_id}",
            )
        if len(expenses) < 3:
            raise HTTPException(
                status_code=400,
                detail=f"Không đủ dữ liệu để phát hiện bất thường. Cần ít nhất 3 tháng, hiện có {len(expenses)} tháng.",
            )

        anomalies = detect_anomalies(expenses, amount_key="total_expense", rel_threshold=rel_threshold)
        trend = trend_analysis(expenses, amount_key="total_expense")
        quality = backtest_forecast(expenses, amount_key="total_expense")

        result = {
            "household_id": household_id,
            "rel_threshold": rel_threshold,
            "anomalies": anomalies,
            "trend": trend,
            "forecast_quality": quality,
            "total_months": len(expenses),
            "anomaly_count": len(anomalies),
        }

        cache.set(cache_key, result)
        return result
    finally:
        if conn is not None and conn.is_connected():
            conn.close()


@router.get(
    "/savings-plan/{household_id}",
    summary="AI savings plan",
    response_description="Projected savings trajectory with actionable targets.",
    responses={
        200: {"model": SavingsPlanResponse, "description": "Savings plan projection."},
        400: {"model": ErrorResponse, "description": "Invalid household_id."},
        404: {"model": ErrorResponse, "description": "No expense or income data."},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded."},
        500: {"model": ErrorResponse, "description": "Database error."},
    },
)
@limiter.limit(DEFAULT_LIMIT)
def savings_plan(
    request: Request,
    household_id: int,
):
    """Generate a **monthly savings plan** projecting surpluses/deficits
    over the next 6 months and recommending concrete actions.
    """
    validate_household_id(household_id)

    cache_key = cache.make_key("savings-plan", household_id)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    conn = None
    try:
        try:
            conn = get_connection()
        except ConnectionError as e:
            handle_db_error("get_connection", e)

        expenses = get_monthly_expenses(household_id, connection=conn)
        incomes = []
        try:
            incomes = get_monthly_incomes(household_id, connection=conn)
        except Exception:
            incomes = []

        budget = get_latest_budget(household_id, connection=conn)

        if not expenses and not incomes:
            raise HTTPException(
                status_code=404,
                detail=f"Không tìm thấy dữ liệu tài chính cho household_id={household_id}",
            )

        # Project next 6 months.
        months_forward = 6
        expense_projections: list[dict] = []
        income_projections: list[dict] = []
        savings_projections: list[dict] = []

        # Start with actual last 3 months for context.
        recent_exp = list(expenses[-3:]) if expenses else []
        recent_inc = list(incomes[-3:]) if incomes else []

        for i in range(months_forward):
            if recent_exp and len(recent_exp) >= 2:
                exp_pred = predict_next_month(recent_exp, amount_key="total_expense")
                exp_val = float(exp_pred["predicted"])
            elif expenses:
                exp_val = float(expenses[-1]["total_expense"])
            else:
                exp_val = 0.0

            if recent_inc and len(recent_inc) >= 2:
                inc_pred = predict_next_month(recent_inc, amount_key="total_income")
                inc_val = float(inc_pred["predicted"])
            elif incomes:
                inc_val = float(incomes[-1]["total_income"])
            else:
                inc_val = None

            surplus = round((inc_val or 0.0) - exp_val, 2) if inc_val is not None else None
            status = (
                "surplus"
                if surplus is not None and surplus > 0
                else "deficit"
                if surplus is not None and surplus < 0
                else "unknown"
            )

            expense_projections.append(
                {"month_offset": i + 1, "predicted_expense": exp_val, "method": exp_pred.get("method")}
            )
            if inc_val is not None:
                income_projections.append(
                    {"month_offset": i + 1, "predicted_income": inc_val, "method": inc_pred.get("method")}
                )
            savings_projections.append(
                {
                    "month_offset": i + 1,
                    "surplus": surplus,
                    "status": status,
                    "cumulative_savings": round(
                        sum(p["surplus"] for p in savings_projections if p["surplus"] is not None), 2
                    ),
                }
            )

            # Feed prediction back for next iteration.
            if len(recent_exp) >= 3:
                recent_exp.pop(0)
            recent_exp.append({"total_expense": exp_val, "month": (int(recent_exp[-1].get("month", 12)) % 12) + 1, "yr": int(recent_exp[-1].get("yr", 2026))})
            if inc_val is not None and len(recent_inc) >= 2:
                if len(recent_inc) >= 3:
                    recent_inc.pop(0)
                recent_inc.append({"total_income": inc_val, "month": (int(recent_inc[-1].get("month", 12)) % 12) + 1, "yr": int(recent_inc[-1].get("yr", 2026))})

        # Overall savings advice.
        savings_advice = generate_savings_advice(
            expense_projections[-1]["predicted_expense"] if expense_projections else 0,
            income_projections[-1]["predicted_income"] if income_projections else None,
            budget,
        )

        result = {
            "household_id": household_id,
            "projection_months": months_forward,
            "expense_projections": expense_projections,
            "income_projections": income_projections,
            "savings_projections": savings_projections,
            "budget": budget,
            "savings_advice": savings_advice,
        }

        cache.set(cache_key, result)
        return result
    finally:
        if conn is not None and conn.is_connected():
            conn.close()


@router.get(
    "/budget-optimizer/{household_id}",
    summary="Budget allocation optimizer",
    response_description="Suggested budget allocations per category based on spending patterns.",
    responses={
        200: {"model": BudgetOptimizerResponse, "description": "Budget optimization suggestions."},
        400: {"model": ErrorResponse, "description": "Invalid household_id."},
        404: {"model": ErrorResponse, "description": "No expense or budget data."},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded."},
        500: {"model": ErrorResponse, "description": "Database error."},
    },
)
@limiter.limit(DEFAULT_LIMIT)
def budget_optimizer(
    request: Request,
    household_id: int,
    threshold: float = 80,
):
    """Suggest **optimal budget allocations** per category based on
    historical spending patterns, overspend frequency, and cutback opportunities.

    - **threshold**: default % of budget that triggers an alert (0-100).
    """
    validate_household_id(household_id)
    threshold = validate_threshold(threshold)

    cache_key = cache.make_key("budget-optimizer", household_id, threshold)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    conn = None
    try:
        try:
            conn = get_connection()
        except ConnectionError as e:
            handle_db_error("get_connection", e)

        category_expenses = get_category_expenses(household_id, connection=conn)
        category_budgets = get_category_budgets(household_id, connection=conn)

        if not category_expenses:
            raise HTTPException(
                status_code=404,
                detail=f"Không tìm thấy dữ liệu danh mục cho household_id={household_id}",
            )

        current_total = sum(float(c["total"]) for c in category_expenses)
        category_analysis = analyze_categories(category_expenses, category_budgets, current_total)
        cutbacks = suggest_cutbacks(category_analysis["categories"])
        alerts = evaluate_alert_thresholds(
            category_analysis["categories"], {}, default_threshold=threshold
        )

        # Compute suggested budget per category:
        # For overspent categories: suggest reducing to 90% of current spend
        # (a realistic cut target). For others: suggest current spend as baseline
        # plus a small inflation buffer (5%).
        # For categories with no budget, suggest the current spend as the new budget.
        optimization: list[dict] = []
        total_suggested_budget = 0.0

        for cat in category_analysis["categories"]:
            name = cat.get("name") or "Other"
            spent = float(cat.get("spent", 0))
            budget = cat.get("budget")
            usage = cat.get("budget_usage")

            if budget is not None and budget > 0 and usage is not None:
                if usage > 100:
                    # Cut to 90% of current spend as a realistic target.
                    suggested = round(spent * 0.9, 2)
                    rationale = f"Hiện tại vượt {usage:.0f}% ngân sách. Gợi ý cắt xuống 90% mức chi tiêu thực tế ({suggested:,.0f})."
                elif usage > threshold:
                    # Near limit — hold steady, trim discretionary.
                    suggested = budget
                    rationale = f"Đang ở {usage:.0f}% ngân sách. Giữ nguyên ngân sách và cắt giảm chi tiêu không thiết yếu trong danh mục này."
                else:
                    # Healthy — allow modest increase for inflation.
                    suggested = round(budget * 1.05, 2)
                    rationale = f"Ngân sách đang ở mức an toàn ({usage:.0f}%). Tăng 5% theo lạm phát lên {suggested:,.0f}."
            else:
                # No existing budget — set to current spend.
                suggested = round(spent * 1.05, 2)
                rationale = f"Chưa có ngân sách cho '{name}'. Đề xuất đặt ngân sách mới ở {suggested:,.0f} (+5% dự phòng lạm phát)."

            total_suggested_budget += suggested
            optimization.append(
                {
                    "category": name,
                    "current_spent": round(spent, 2),
                    "current_budget": budget,
                    "suggested_budget": round(suggested, 2),
                    "budget_change_pct": round((suggested - (budget or 0)) / ((budget or 1)) * 100, 1) if budget and budget > 0 else None,
                    "rationale": rationale,
                    "priority": "high" if (usage and usage > 100) else ("medium" if (usage and usage > threshold) else "low"),
                }
            )

        # Sort by priority (high first).
        priority_order = {"high": 0, "medium": 1, "low": 2}
        optimization.sort(key=lambda x: priority_order.get(x["priority"], 3))

        result = {
            "household_id": household_id,
            "total_current_monthly_spend": round(current_total, 2),
            "total_suggested_budget": round(total_suggested_budget, 2),
            "total_current_budget": sum(float(c.get("budget_amount", 0) or 0) for c in category_budgets),
            "optimization": optimization,
            "cutback_opportunities": cutbacks,
            "alerts": alerts,
        }

        cache.set(cache_key, result)
        return result
    finally:
        if conn is not None and conn.is_connected():
            conn.close()


@router.get(
    "/category-insights/{household_id}",
    summary="Deep category-level insights",
    response_description="Per-category trend, forecast, and optimization recommendations.",
    responses={
        200: {"model": CategoryInsightsResponse, "description": "Category-level insights."},
        400: {"model": ErrorResponse, "description": "Invalid household_id."},
        404: {"model": ErrorResponse, "description": "No expense data."},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded."},
        500: {"model": ErrorResponse, "description": "Database error."},
    },
)
@limiter.limit(DEFAULT_LIMIT)
def category_insights(
    request: Request,
    household_id: int,
):
    """Deep dive into **per-category spending patterns**: trend direction,
    forecast for next month, budget usage, and specific optimization
    recommendations for each category.
    """
    validate_household_id(household_id)

    cache_key = cache.make_key("category-insights", household_id)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    conn = None
    try:
        try:
            conn = get_connection()
        except ConnectionError as e:
            handle_db_error("get_connection", e)

        cat_monthly = get_monthly_category_expenses(household_id, months=12, connection=conn)
        category_expenses = get_category_expenses(household_id, connection=conn)
        category_budgets = get_category_budgets(household_id, connection=conn)

        if not cat_monthly and not category_expenses:
            raise HTTPException(
                status_code=404,
                detail=f"Không tìm thấy dữ liệu danh mục cho household_id={household_id}",
            )

        # Forecast per category.
        cat_forecast = forecast_category_breakdown(cat_monthly) if cat_monthly else []

        # Current month analysis.
        current_total = sum(float(c["total"]) for c in category_expenses) if category_expenses else 0
        cat_analysis = analyze_categories(category_expenses, category_budgets, current_total)

        # Enrich each category with trend + forecast + optimization.
        budget_map = {}
        for b in category_budgets:
            if b.get("category_name"):
                budget_map[b["category_name"]] = float(b["budget_amount"])

        enhanced: list[dict] = []
        for fc in cat_forecast:
            name = fc.get("category") or "Other"
            # Find matching current analysis.
            current_cat = next(
                (c for c in cat_analysis["categories"] if c.get("name") == name), None
            )
            budget = budget_map.get(name)

            # Optimization suggestion per category.
            suggestion: str | None = None
            if current_cat and budget and budget > 0:
                usage = current_cat.get("budget_usage")
                over = current_cat.get("over_amount", 0)
                if usage and usage > 100:
                    suggestion = f"Giảm {over:,.0f} để đưa chi tiêu '{name}' về đúng ngân sách {budget:,.0f}."
                elif usage and usage > 80:
                    suggestion = f"'{name}' đang ở {usage:.0f}% ngân sách. Cân nhắc giới hạn chi tiêu mềm ở mức {budget:,.0f}."
                elif usage and usage < 50 and (current_cat.get("spent", 0) or 0) > 0:
                    surplus_budget = budget - float(current_cat.get("spent", 0))
                    suggestion = f"'{name}' chỉ dùng {usage:.0f}% ngân sách. Có thể chuyển {surplus_budget:,.0f} sang danh mục khác hoặc tiết kiệm."
            elif not budget and current_cat and (current_cat.get("spent", 0) or 0) > 0:
                suggestion = f"Chưa có ngân sách cho '{name}'. Đề xuất đặt ngân sách dựa trên mức chi tiêu trung bình."

            enhanced.append(
                {
                    "category": name,
                    "current_spent": current_cat.get("spent") if current_cat else None,
                    "transaction_count": current_cat.get("transaction_count") if current_cat else 0,
                    "trend": fc.get("trend", {}),
                    "forecast_next_month": {
                        "predicted": fc.get("predicted"),
                        "interval": fc.get("interval"),
                        "method": fc.get("method"),
                        "confidence": fc.get("confidence"),
                    },
                    "last_month": fc.get("last"),
                    "budget": budget,
                    "budget_usage": current_cat.get("budget_usage") if current_cat else None,
                    "over_amount": current_cat.get("over_amount", 0) if current_cat else 0,
                    "suggestion": suggestion,
                }
            )

        # Sort by forecast amount descending.
        enhanced.sort(key=lambda x: -(x["forecast_next_month"].get("predicted") or 0))

        result = {
            "household_id": household_id,
            "categories": enhanced,
            "summary": {
                "total_categories": len(enhanced),
                "total_forecast": round(
                    sum(c["forecast_next_month"].get("predicted", 0) or 0 for c in enhanced), 2
                ),
                "categories_over_budget": sum(
                    1 for c in enhanced if c.get("budget_usage") and c["budget_usage"] > 100
                ),
                "categories_near_limit": sum(
                    1
                    for c in enhanced
                    if c.get("budget_usage") and 80 < c["budget_usage"] <= 100
                ),
                "categories_under_budget": sum(
                    1 for c in enhanced if c.get("budget_usage") and c["budget_usage"] <= 80
                ),
            },
        }

        cache.set(cache_key, result)
        return result
    finally:
        if conn is not None and conn.is_connected():
            conn.close()
