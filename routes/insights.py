"""API tổng hợp phân tích tài chính — GET /insights/{household_id}

Tập hợp dự đoán (RAG), phân tích danh mục, phát hiện bất thường, lời khuyên
tiết kiệm và các hành động được khuyến nghị vào một response duy nhất.
"""

from fastapi import APIRouter, HTTPException, Request
from typing import Optional

from db.connection import get_connection
from services import cache
from services.limiter import limiter, DEFAULT_LIMIT
from services.db_service import (
    get_monthly_expenses,
    get_latest_budget,
    get_category_expenses,
    get_category_budgets,
    get_monthly_incomes,
    get_monthly_category_expenses,
    get_household_currency,
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
)
from services.validation import (
    validate_household_id,
    validate_threshold,
    handle_db_error,
)
from services.schemas import InsightsResponse, ErrorResponse

router = APIRouter(tags=["Insights"])


def _parse_category_thresholds(raw: str | None) -> dict[str, float]:
    """Parse 'Food:80,Groceries:90' -> {'Food': 80.0, 'Groceries': 90.0}."""
    out: dict[str, float] = {}
    if not raw:
        return out
    for part in raw.split(","):
        if ":" not in part:
            continue
        name, val = part.split(":", 1)
        try:
            out[name.strip()] = float(val.strip())
        except ValueError:
            continue
    return out


@router.get(
    "/insights/{household_id}",
    summary="Aggregated financial insights",
    response_description="Forecasts, category analysis, anomalies, savings and recommended actions.",
    responses={
        200: {"model": InsightsResponse, "description": "Full insights payload."},
        400: {"model": ErrorResponse, "description": "Invalid household_id or not enough history."},
        404: {"model": ErrorResponse, "description": "No expense data for this household."},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded."},
        500: {"model": ErrorResponse, "description": "Database error."},
    },
)
@limiter.limit(DEFAULT_LIMIT)
def insights(
    request: Request,
    household_id: int,
    threshold: float = 80,
    category_thresholds: Optional[str] = None,
):
    """Aggregate the **full financial picture** for a household in one response:
    expense & income forecasts, category breakdown, anomaly detection, savings
    projection, cutback levers, alert thresholds, per-category forecasts and
    walk-forward forecast quality. Requires at least 3 months of history.
    """

    # Bảo mật: validate đầu vào trước khi truy vấn DB.
    validate_household_id(household_id)
    threshold = validate_threshold(threshold)

    # Cache: phục vụ từ cache nếu còn hạn (dữ liệu hộ chỉ đổi hàng tháng, và
    # ghi chi tiêu sẽ invalidate). Không cache lỗi 404/400/500.
    cache_key = cache.make_key(
        "insights", household_id, threshold, category_thresholds
    )
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Một connection cho toàn bộ request — tái sử dụng thay vì lấy/trả pool ở
    # mỗi query (/insights có ~6 query).
    conn = None
    try:
        try:
            conn = get_connection()
        except ConnectionError as e:
            handle_db_error("get_connection", e)

        # Get household currency for forecasting
        household_currency = get_household_currency(household_id, connection=conn)

        # Bước 1: Dữ liệu chi tiêu theo tháng
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

        # Bước 2: Ngân sách mới nhất
        budget = get_latest_budget(household_id, connection=conn)

        # Bước 2.5: Truy xuất danh mục làm ngữ cảnh RAG (best-effort).
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

        # Bước 3: Dự đoán chi tiêu (RAG) + phân tích
        pred_res = predict_next_month(
            expenses,
            amount_key="total_expense",
            category_context=category_expenses,
            budget=budget,
            household_id=household_id,
            target_currency=household_currency,
            connection=conn,
        )
        predicted = float(pred_res["predicted"])
        last_month = float(expenses[-1]["total_expense"])
        # Truyền interval để cảnh báo cả khi cận trên khoảng dự báo vượt ngân sách
        # dù điểm ước chưa vượt (logic escalation trong analyze()).
        analysis = analyze(predicted, last_month, budget, interval=pred_res.get("interval"))

        # Chất lượng dự báo: backtest walk-forward (None nếu lịch sử quá ngắn).
        forecast_quality = backtest_forecast(expenses, amount_key="total_expense")

        # Bước 4: Dự đoán thu nhập (nếu đủ dữ liệu)
        incomes = []
        try:
            incomes = get_monthly_incomes(household_id, connection=conn)
        except Exception:
            incomes = []

        predicted_income = None
        last_month_income = None
        income_analysis = {}
        inc_res = None
        if incomes and len(incomes) >= 3:
            inc_res = predict_next_month(
                incomes,
                amount_key="total_income",
                household_id=household_id,
                target_currency=household_currency,
                connection=conn,
            )
            predicted_income = float(inc_res["predicted"])
            last_month_income = float(incomes[-1]["total_income"])
            income_analysis = analyze_income(predicted_income, last_month_income)

        # Bước 5: Phân tích danh mục
        try:
            category_analysis = analyze_categories(
                category_expenses, category_budgets, current_month_total
            )
        except Exception:
            category_analysis = {
                "categories": [],
                "overspent_categories": [],
                "suggestions": [],
                "total_budget": 0,
            }

        # Bước 5.5: Đề xuất cắt giảm phần vượt ngân sách + đánh giá ngưỡng cảnh báo.
        thresholds = _parse_category_thresholds(category_thresholds)
        cutbacks = suggest_cutbacks(category_analysis["categories"])
        alerts = evaluate_alert_thresholds(
            category_analysis["categories"],
            thresholds,
            default_threshold=threshold,
        )

        # Bước 6: Các phân tích nâng cao (insights)
        anomalies = detect_anomalies(expenses, amount_key="total_expense")
        savings = generate_savings_advice(predicted, predicted_income, budget)
        actions = recommend_actions(analysis, category_analysis, anomalies, savings)

        # Bước 6.5: Dự báo theo danh mục (best-effort, không làm sập nếu lỗi phụ).
        category_forecast: list[dict] = []
        try:
            cat_monthly = get_monthly_category_expenses(household_id, connection=conn)
            category_forecast = forecast_category_breakdown(cat_monthly)
        except Exception:
            pass

        result = {
            "household_id": household_id,
        "predictions": {
            "expense": {
                "predicted": predicted,
                "last_month": last_month,
                "interval": pred_res.get("interval"),
                "increase_percent": analysis["increase_percent"],
                "status": analysis["status"],
                "method": pred_res.get("method"),
                "confidence": pred_res.get("confidence"),
                "explanation": pred_res.get("explanation"),
                "suggestions": pred_res.get("suggestions", []),
            },
            "income": (
                {
                    "predicted": predicted_income,
                    "last_month": last_month_income,
                    "interval": inc_res.get("interval") if inc_res else None,
                    "increase_percent": income_analysis.get("increase_percent"),
                    "status": income_analysis.get("status"),
                    "method": inc_res.get("method") if inc_res else None,
                    "confidence": inc_res.get("confidence") if inc_res else None,
                    "explanation": inc_res.get("explanation") if inc_res else None,
                    "suggestions": inc_res.get("suggestions", []) if inc_res else [],
                }
                if inc_res
                else None
            ),
            "budget": budget,
            "category_forecast": category_forecast,
            "forecast_quality": forecast_quality,
            "currency": household_currency,
        },
        "analysis": {
            "message": analysis["message"],
            "suggestion": analysis["suggestion"],
        },
        "category_analysis": category_analysis,
        "cutback_suggestions": cutbacks,
        "alert_thresholds": {
            "default_threshold": threshold,
            "per_lever_thresholds": thresholds,
            "result": alerts,
        },
        "anomalies": anomalies,
        "savings": savings,
        "recommended_actions": actions,
        }

        cache.set(cache_key, result)
        return result
    finally:
        # Trả connection về pool (chỉ khi đã mở thành công).
        if conn is not None and conn.is_connected():
            conn.close()
