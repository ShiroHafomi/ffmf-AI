"""API dự đoán chi tiêu — GET /predict/{household_id}"""

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
)
from services.ai_service import (
    predict_next_month,
    analyze,
    analyze_categories,
    analyze_income,
    suggest_cutbacks,
    evaluate_alert_thresholds,
)
from services.validation import (
    validate_household_id,
    validate_threshold,
    handle_db_error,
)
from services.schemas import PredictResponse, ErrorResponse

router = APIRouter(tags=["Predictions"])


@router.get(
    "/predict/{household_id}",
    summary="Forecast next month's expenses",
    response_description="Prediction plus budget analysis and category breakdown.",
    responses={
        200: {"model": PredictResponse, "description": "Forecast and analysis."},
        400: {"model": ErrorResponse, "description": "Invalid household_id or not enough history."},
        404: {"model": ErrorResponse, "description": "No expense data for this household."},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded."},
        500: {"model": ErrorResponse, "description": "Database error."},
    },
)
@limiter.limit(DEFAULT_LIMIT)
def predict(
    request: Request,
    household_id: int,
    threshold: float = 80,
    category_thresholds: Optional[str] = None,
):
    """Predict the household's **total spend for next month**.

    Uses the deterministic forecaster (Linear Regression / Holt + seasonal) as the
    primary model, enriches suggestions via offline RAG retrieval, and only calls
    an LLM when explicitly opted in. Requires at least 3 months of history.

    - **household_id**: positive integer primary key.
    - **threshold**: default budget-usage alert threshold (%), clamped to 0–100.
    - **category_thresholds**: optional per-lever overrides, e.g. `Food:80,Rent:95`.
    """

    # Bảo mật: validate đầu vào trước khi truy vấn DB.
    validate_household_id(household_id)
    threshold = validate_threshold(threshold)

    # Cache: kết quả dự báo thực tế chỉ đổi khi dữ liệu hộ thay đổi (hàng tháng),
    # nên phục vụ từ cache nếu còn hạn. Không cache các lỗi 404/400/500.
    cache_key = cache.make_key(
        "predict", household_id, threshold, category_thresholds
    )
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Một connection cho toàn bộ request — tái sử dụng thay vì lấy/trả pool
    # ở mỗi query (giảm chấn thương pool ~6 lần/request).
    conn = None
    try:
        try:
            conn = get_connection()
        except ConnectionError as e:
            handle_db_error("get_connection", e)

        # Bước 1: Lấy dữ liệu chi tiêu
        expenses = get_monthly_expenses(household_id, connection=conn)

        # Bước 2: Kiểm tra có dữ liệu không
        if not expenses:
            raise HTTPException(
                status_code=404,
                detail=f"Không tìm thấy dữ liệu chi tiêu cho household_id={household_id}",
            )

        # Bước 3: Cần ít nhất 3 tháng dữ liệu
        if len(expenses) < 3:
            raise HTTPException(
                status_code=400,
                detail=f"Không đủ dữ liệu. Cần ít nhất 3 tháng, hiện có {len(expenses)} tháng.",
            )

        # Bước 4: Lấy ngân sách mới nhất
        budget = get_latest_budget(household_id, connection=conn)

        # Bước 4.5: Truy xuất (retrieve) phân rã danh mục làm ngữ cảnh cho RAG.
        # Nằm ngoài luồng chính — nếu lỗi truy vấn phụ thì bỏ qua, không làm sập.
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

        # Bước 5: Dự đoán (deterministic primary; RAG retrieval enriches suggestions;
        # LLM chỉ dùng nếu LLM_PROVIDER được bật tường minh).
        pred_res = predict_next_month(
            expenses,
            amount_key="total_expense",
            category_context=category_expenses,
            budget=budget,
        )
        predicted = float(pred_res["predicted"])
        last_month = float(expenses[-1]["total_expense"])

        # Bước 5.5: Dự đoán thu nhập (nếu đủ dữ liệu)
        incomes = []
        try:
            incomes = get_monthly_incomes(household_id, connection=conn)
        except Exception:
            incomes = []

        predicted_income = None
        last_month_income = None
        income_analysis = {}
        if incomes and len(incomes) >= 3:
            inc_res = predict_next_month(incomes, amount_key="total_income")
            predicted_income = float(inc_res["predicted"])
            last_month_income = float(incomes[-1]["total_income"])
            income_analysis = analyze_income(predicted_income, last_month_income)

        # Bước 6: Phân tích và trả kết quả (truyền interval để cảnh báo cả khi
        # cận trên của khoảng dự báo vượt ngân sách dù điểm ước chưa vượt).
        analysis = analyze(predicted, last_month, budget, interval=pred_res.get("interval"))

        # Bước 7: Phân tích danh mục.
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

        # Bước 7.5: Đề xuất cắt giảm phần vượt ngân sách + ngưỡng cảnh báo theo lever.
        thresholds: dict[str, float] = {}
        if category_thresholds:
            for part in category_thresholds.split(","):
                if ":" not in part:
                    continue
                name, val = part.split(":", 1)
                try:
                    thresholds[name.strip()] = float(val.strip())
                except ValueError:
                    continue
        cutbacks = suggest_cutbacks(category_analysis["categories"])
        alerts = evaluate_alert_thresholds(
            category_analysis["categories"],
            thresholds,
            default_threshold=threshold,
        )

        result = {
        "predicted": predicted,
        "last_month": last_month,
        "budget": budget,
        "increase_percent": analysis["increase_percent"],
        "status": analysis["status"],
        "message": analysis["message"],
        "suggestion": analysis["suggestion"],
        # Thông tin dự đoán — method cho biết dùng mô hình deterministic hay LLM (nếu opt-in).
        "prediction_method": pred_res.get("method"),
        "prediction_confidence": pred_res.get("confidence"),
        "prediction_interval": pred_res.get("interval"),
        "prediction_explanation": pred_res.get("explanation"),
        "prediction_suggestions": pred_res.get("suggestions", []),
        "category_analysis": category_analysis,
        "cutback_suggestions": cutbacks,
        "alert_thresholds": {
            "default_threshold": threshold,
            "per_lever_thresholds": thresholds,
            "result": alerts,
        },
        "predicted_income": predicted_income,
        "last_month_income": last_month_income,
        "income_increase_percent": income_analysis.get("increase_percent"),
        "income_status": income_analysis.get("status"),
        "income_message": income_analysis.get("message"),
            "income_suggestion": income_analysis.get("suggestion"),
        }

        cache.set(cache_key, result)
        return result
    finally:
        # Trả connection về pool (chỉ khi đã mở thành công).
        if conn is not None and conn.is_connected():
            conn.close()
