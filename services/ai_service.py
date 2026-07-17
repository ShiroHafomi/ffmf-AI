"""Dự đoán chi tiêu bằng RAG (Retrieval-Augmented Generation) với Claude.

Quy trình:
  1. Truy xuất (retrieve) lịch sử chi tiêu theo tháng + phân rã danh mục.
  2. Đưa ngữ cảnh đó vào prompt và gọi Claude (Anthropic) qua tool-use
     có cấu trúc để lấy: predicted (số), explanation, suggestions, confidence.
  3. Nếu thiếu ANTHROPIC_API_KEY, gọi API lỗi/từ chối, hoặc kết quả vô lý
     -> tự động fallback về Linear Regression (tất định) để service không
     bao giờ gãy.

Các hàm analyze / analyze_categories / detect_anomalies / ... giữ nguyên.
"""

import os

from dotenv import load_dotenv

load_dotenv()

import numpy as np
from sklearn.linear_model import LinearRegression

# Model mặc định — luôn dùng claude-opus-4-8 trừ khi ghi đè qua env.
DEFAULT_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")

# System prompt ổn định (có thể cache).
_RAG_SYSTEM = (
    "You are a household finance forecasting assistant for the FFMS app. "
    "You are given a household's RETRIEVED monthly spending history (oldest to newest) "
    "and, when available, a current-month category breakdown with budgets. "
    "Predict the household's TOTAL spend for the NEXT calendar month. "
    "Ground your prediction in: the recent trend/slope, any acceleration or deceleration, "
    "obvious seasonality, and category spending relative to budget. "
    "Be financially conservative — do not invent one-off events. "
    "Return exactly one number for the predicted total and a short rationale."
)


# ───────────────────────── Linear regression (fallback) ─────────────────────────
def linear_regression_predict(data: list[dict], amount_key: str = "total_expense") -> float:
    """Dự đoán bằng Linear Regression (dùng làm fallback tất định)."""
    totals = np.array([float(row[amount_key]) for row in data])
    X = np.arange(len(totals)).reshape(-1, 1)
    y = totals
    model = LinearRegression()
    model.fit(X, y)
    next_idx = len(totals)
    predicted = model.predict(np.array([[next_idx]]))[0]
    return round(float(predicted), 2)


# ─────────────── Holt's double exponential smoothing (trend-aware) ───────────────
def holt_forecast(totals: list[float], h: int = 1, alpha: float = 0.6, beta: float = 0.3) -> float:
    """Dự báo chuỗi bằng Holt (cấp độ + xu hướng), tốt hơn Linear Regression
    khi chuỗi có xu hướng phi tuyến nhẹ. Trả về giá trị dự báo bước h tới.
    """
    n = len(totals)
    if n < 2:
        return float(totals[-1]) if totals else 0.0

    level = float(totals[0])
    trend = float(totals[1] - totals[0])
    for y in totals[1:]:
        last_level = level
        level = alpha * y + (1 - alpha) * (level + trend)
        trend = beta * (level - last_level) + (1 - beta) * trend
    return level + h * trend


def _apply_seasonality(totals: list[float], months: list[int], base: float) -> float:
    """Điều chỉnh theo mùa nhẹ (additive) theo tháng dương lịch khi có >= 12 điểm.
    Detrend bằng bước trung bình, tính chỉ số theo tháng, cộng chỉ số tháng tới.
    """
    n = len(totals)
    if n < 12 or not months:
        return base

    steps = [totals[i] - totals[i - 1] for i in range(1, n)]
    avg_step = sum(steps) / len(steps) if steps else 0.0
    detr = [totals[i] - i * avg_step for i in range(n)]

    sums: dict[int, float] = {}
    counts: dict[int, float] = {}
    for m, v in zip(months, detr):
        sums[m] = sums.get(m, 0.0) + v
        counts[m] = counts.get(m, 0.0) + 1
    mean_detr = sum(detr) / n
    idx = {m: sums[m] / counts[m] - mean_detr for m in sums}
    if not idx:
        return base

    next_month = (months[-1] % 12) + 1
    return base + idx.get(next_month, 0.0)


def deterministic_forecast(
    data: list[dict], amount_key: str = "total_expense"
) -> tuple[float, str]:
    """Chọn mô hình tất định theo độ dài chuỗi:
      - < 2 điểm : không dự báo được (0.0)
      - 2..5 điểm : Linear Regression (khớp test hồi quy tuyến tính)
      - >= 6 điểm : Holt; >= 12 điểm thêm điều chỉnh theo mùa.
    Trả về (predicted, method).
    """
    totals = [float(row.get(amount_key, 0)) for row in data]
    n = len(totals)
    if n < 2:
        return 0.0, "fallback_none"
    if n < 6:
        return round(float(linear_regression_predict(data, amount_key)), 2), "fallback_linear_regression"

    base = holt_forecast(totals)
    method = "fallback_holt"
    if n >= 12:
        months = [int(row.get("month", 0)) for row in data]
        base = _apply_seasonality(totals, months, base)
        method = "fallback_holt_seasonal"
    return round(float(base), 2), method


# ───────────────────────── Retrieval context builder ─────────────────────────
def _build_retrieval_context(
    data: list[dict],
    amount_key: str,
    category_context: list[dict] | None,
    budget: float | None,
    kind: str,
) -> str:
    """Đóng gói lịch sử + ngữ cảnh danh mục thành văn bản truy xuất."""
    lines: list[str] = []
    label = "INCOME" if kind == "income" else "EXPENSE"
    lines.append(f"RETRIEVED MONTHLY {label} HISTORY (oldest -> newest):")
    for row in data:
        ym = f"{int(row.get('yr', 0))}-{int(row.get('month', 0)):02d}"
        amt = float(row.get(amount_key, 0))
        lines.append(f"- {ym}: {amt:,.2f}")

    if budget is not None:
        lines.append(f"\nCURRENT TOTAL BUDGET: {float(budget):,.2f}")

    if category_context:
        lines.append("\nCURRENT-MONTH CATEGORY BREAKDOWN (spent / budget):")
        for c in category_context:
            name = c.get("category_name") or "Other"
            spent = float(c.get("total", 0))
            bud = c.get("budget_amount")
            if bud is not None:
                lines.append(f"- {name}: {spent:,.2f} / {float(bud):,.2f}")
            else:
                lines.append(f"- {name}: {spent:,.2f} (no budget)")

    lines.append("\nCall the report_prediction tool with your prediction.")
    return "\n".join(lines)


# ───────────────────────── Tool spec (structured output) ─────────────────────────
def _rag_tool_spec() -> dict:
    return {
        "name": "report_prediction",
        "description": "Report the predicted next-month total plus a short rationale and tips.",
        "input_schema": {
            "type": "object",
            "properties": {
                "predicted": {
                    "type": "number",
                    "description": "Predicted TOTAL spend for next month, as a plain number (e.g. 1250.50).",
                },
                "explanation": {
                    "type": "string",
                    "description": "2-3 sentence rationale grounded in the provided history.",
                },
                "suggestions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Up to 3 short, actionable tips.",
                },
                "confidence": {
                    "type": "string",
                    "enum": ["low", "medium", "high"],
                    "description": "Your confidence in this prediction.",
                },
            },
            "required": ["predicted", "explanation", "suggestions", "confidence"],
            "additionalProperties": False,
        },
        "strict": True,
    }


# ───────────────────────── Fallback helper ─────────────────────────
def _rag_fallback(data: list[dict], amount_key: str, reason: str) -> dict:
    pred, method = deterministic_forecast(data, amount_key)
    label = {
        "fallback_linear_regression": "linear regression",
        "fallback_holt": "Holt exponential smoothing",
        "fallback_holt_seasonal": "Holt exponential smoothing (seasonal)",
        "fallback_none": "no history",
    }.get(method, "deterministic model")
    return {
        "predicted": pred,
        "explanation": f"Deterministic fallback ({label}). {reason}",
        "suggestions": [],
        "confidence": "low",
        "method": method,
    }


# ───────────────────────── RAG predict (Claude) ─────────────────────────
def rag_predict(
    data: list[dict],
    amount_key: str = "total_expense",
    category_context: list[dict] | None = None,
    budget: float | None = None,
    kind: str = "expense",
) -> dict:
    """Gọi Claude để dự đoán, fallback về Linear Regression khi cần."""
    if not data or len(data) < 2:
        return _rag_fallback(data or [], amount_key, "Not enough history.")

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return _rag_fallback(data, amount_key, "ANTHROPIC_API_KEY not set.")

    try:
        from anthropic import (
            Anthropic,
            APIConnectionError,
            APIError,
            APITimeoutError,
            RateLimitError,
        )
    except ImportError:
        return _rag_fallback(data, amount_key, "anthropic SDK not installed.")

    model = os.getenv("ANTHROPIC_MODEL", DEFAULT_MODEL)
    context = _build_retrieval_context(data, amount_key, category_context, budget, kind)

    try:
        client = Anthropic(api_key=api_key, timeout=20, max_retries=1)
        resp = client.messages.create(
            model=model,
            max_tokens=1024,
            system=[
                {
                    "type": "text",
                    "text": _RAG_SYSTEM,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[_rag_tool_spec()],
            tool_choice={"type": "tool", "name": "report_prediction"},
            messages=[{"role": "user", "content": context}],
        )
    except (APIError, APIConnectionError, RateLimitError, APITimeoutError) as e:
        return _rag_fallback(data, amount_key, f"Claude API error: {type(e).__name__}.")
    except Exception as e:  # noqa: BLE001 — bất kỳ lỗi nào cũng fallback
        return _rag_fallback(data, amount_key, f"Claude call failed: {type(e).__name__}.")

    # Claude 4.8 có thể từ chối (refusal) — coi như thất bại, fallback.
    if getattr(resp, "stop_reason", None) == "refusal":
        return _rag_fallback(data, amount_key, "Model refused the request.")

    tool_use = next(
        (b for b in resp.content if getattr(b, "type", None) == "tool_use"), None
    )
    if not tool_use:
        return _rag_fallback(data, amount_key, "No tool_use block in response.")

    try:
        inp = tool_use.input
        predicted = float(inp["predicted"])
    except (KeyError, TypeError, ValueError):
        return _rag_fallback(data, amount_key, "Could not parse predicted value.")

    # Kiểm tra giá trị hợp lý; nếu vô lý thì fallback.
    recent = [float(r.get(amount_key, 0)) for r in data]
    avg = sum(recent) / len(recent) if recent else 0
    if not np.isfinite(predicted) or predicted < 0 or predicted > 5 * max(avg, 1):
        return _rag_fallback(data, amount_key, "Predicted value out of sane range.")

    return {
        "predicted": round(predicted, 2),
        "explanation": str(inp.get("explanation", "")),
        "suggestions": list(inp.get("suggestions", []) or [])[:3],
        "confidence": str(inp.get("confidence", "medium")),
        "method": "rag",
    }


def predict_next_month(
    data: list[dict],
    amount_key: str = "total_expense",
    category_context: list[dict] | None = None,
    budget: float | None = None,
) -> dict:
    """Dự đoán tháng tiếp theo bằng RAG (Claude) truy xuất lịch sử + danh mục.

    Trả về dict: {predicted, explanation, suggestions, confidence, method}.
    Nếu thiếu key / lỗi API / kết quả vô lý -> tự động fallback Linear Regression.
    """
    kind = "income" if amount_key == "total_income" else "expense"
    return rag_predict(
        data,
        amount_key=amount_key,
        category_context=category_context,
        budget=budget,
        kind=kind,
    )


def analyze(predicted: float, last_month: float, budget: float | None) -> dict:
    """Phân tích kết quả dự đoán so với tháng trước và ngân sách."""

    if last_month > 0:
        increase_percent = round(((predicted - last_month) / last_month) * 100, 2)
    else:
        increase_percent = 0.0

    status = "normal"
    message = "Your spending is on track. Keep it up!"
    suggestion = "Continue maintaining your current spending habits."

    if budget is not None and predicted > budget:
        status = "warning"
        message = "Next month expense may exceed your budget"
        suggestion = "Reduce unnecessary spending and electricity usage"

    if increase_percent > 20:
        status = "abnormal"
        message = "Spending is increasing abnormally compared to last month"
        suggestion = "Review recent large transactions and cut non-essential expenses immediately"

    return {
        "increase_percent": increase_percent,
        "status": status,
        "message": message,
        "suggestion": suggestion,
    }


def analyze_income(predicted: float, last_month: float) -> dict:
    """Phân tích kết quả dự đoán thu nhập so với tháng trước."""
    if last_month > 0:
        increase_percent = round(((predicted - last_month) / last_month) * 100, 2)
    else:
        increase_percent = 0.0

    status = "normal"
    message = "Your income is stable."
    suggestion = "Keep up the good work and consider saving any surplus."

    if increase_percent > 10:
        status = "positive"
        message = "Your income is projected to increase!"
        suggestion = "Great job! Consider investing the extra income."
    elif increase_percent < -10:
        status = "warning"
        message = "Your income is projected to decrease."
        suggestion = "Review your income sources and prepare a tighter budget."

    return {
        "increase_percent": increase_percent,
        "status": status,
        "message": message,
        "suggestion": suggestion,
    }


def analyze_categories(
    category_expenses: list[dict],
    category_budgets: list[dict],
    total_expense: float,
) -> dict:
    """Phân tích chi tiết theo danh mục — trả về structured data cho frontend dịch."""

    budget_map = {}
    for b in category_budgets:
        if b.get("category_name"):
            budget_map[b["category_name"]] = float(b["budget_amount"])

    total_budget = sum(budget_map.values()) if budget_map else 0

    categories = []
    overspent = []
    high_spend = []

    for cat in category_expenses:
        name = cat.get("category_name") or "Other"
        spent = float(cat["total"])
        count = int(cat["transaction_count"])
        budget = budget_map.get(name)

        pct_of_total = round((spent / total_expense * 100), 1) if total_expense > 0 else 0

        cat_info = {
            "name": name,
            "spent": spent,
            "transaction_count": count,
            "percent_of_total": pct_of_total,
            "budget": budget,
        }

        if budget and budget > 0:
            usage = round((spent / budget * 100), 1)
            cat_info["budget_usage"] = usage
            cat_info["over_amount"] = round(spent - budget, 2) if spent > budget else 0

            if spent > budget:
                overspent.append(cat_info)

        if pct_of_total > 30:
            high_spend.append(cat_info)

        categories.append(cat_info)

    overspent.sort(key=lambda x: x.get("over_amount", 0), reverse=True)

    suggestions = []

    for cat in overspent:
        suggestions.append({
            "type": "overspent",
            "category": cat["name"],
            "spent": cat["spent"],
            "budget": cat["budget"],
            "over_amount": cat["over_amount"],
            "budget_usage": cat["budget_usage"],
        })

    for cat in high_spend:
        if cat["name"] not in [s["category"] for s in suggestions]:
            suggestions.append({
                "type": "high_ratio",
                "category": cat["name"],
                "spent": cat["spent"],
                "percent_of_total": cat["percent_of_total"],
            })

    if total_budget > 0 and total_expense > 0:
        overall_usage = round((total_expense / total_budget * 100), 1)
        suggestions.append({
            "type": "overall",
            "total_expense": total_expense,
            "total_budget": total_budget,
            "usage_percent": overall_usage,
        })

    return {
        "categories": categories,
        "overspent_categories": overspent,
        "suggestions": suggestions,
        "total_budget": total_budget,
    }


def forecast_category_breakdown(
    category_monthly: list[dict],
    amount_key: str = "total",
) -> list[dict]:
    """Dự báo chi tiêu tháng tới theo từng danh mục từ chuỗi tháng của mỗi danh mục.

    ``category_monthly`` : kết quả của ``db_service.get_monthly_category_expenses``
    — mỗi phần tử {category_name, yr, month, total}. Gom theo danh mục, sắp xếp
    theo thời gian, rồi dùng ``deterministic_forecast``.
    """
    from collections import defaultdict

    by_cat: dict[str, list[dict]] = defaultdict(list)
    for r in category_monthly:
        name = r.get("category_name") or "Other"
        by_cat[name].append(
            {"yr": int(r.get("yr", 0)), "month": int(r.get("month", 0)), "total": float(r.get(amount_key, 0))}
        )

    out: list[dict] = []
    for name, series in by_cat.items():
        series.sort(key=lambda x: (x["yr"], x["month"]))
        if len(series) < 2:
            predicted = round(series[0]["total"], 2) if series else 0.0
            method = "fallback_none" if not series else "single_point"
        else:
            predicted, method = deterministic_forecast(series, amount_key)
        out.append(
            {
                "category": name,
                "predicted": predicted,
                "last": round(series[-1]["total"], 2),
                "months": len(series),
                "method": method,
            }
        )

    out.sort(key=lambda x: -x["predicted"])
    return out


def suggest_cutbacks(categories: list[dict]) -> dict:
    """Đề xuất số tiền tiết kiệm được nếu cắt giảm phần vượt ngân sách (excess)
    của từng danh mục (lever).

    Nhận vào danh sách `categories` (kết quả của analyze_categories) — mỗi phần
    tử có ít nhất ``name``, ``spent``, ``budget``. Với mỗi danh mục vượt ngân
    sách, gợi ý cắt giảm đúng phần dư (over_amount) để đưa chi tiêu về ngân sách.
    """

    levers: list[dict] = []
    total_potential_saving = 0.0

    for cat in categories:
        name = cat.get("name") or "Other"
        spent = float(cat.get("spent", 0))
        budget = cat.get("budget")
        if budget is None or budget <= 0:
            continue

        # over_amount ưu tiên lấy từ analyze_categories; tính lại nếu thiếu.
        over = cat.get("over_amount")
        if over is None:
            over = spent - budget
        over = float(over)
        if over <= 0:
            continue

        total_potential_saving += over
        levers.append({
            "lever": name,
            "current_spent": round(spent, 2),
            "budget": round(float(budget), 2),
            "excess": round(over, 2),
            "suggested_cutback": round(over, 2),
            "projected_spent": round(float(budget), 2),
            "message": (
                f"Cắt giảm {over:,.0f} ở '{name}' để đưa chi tiêu "
                f"về đúng ngân sách {float(budget):,.0f}."
            ),
        })

    levers.sort(key=lambda s: s["excess"], reverse=True)
    return {
        "levers": levers,
        "total_potential_saving": round(total_potential_saving, 2),
        "count": len(levers),
    }


def evaluate_alert_thresholds(
    categories: list[dict],
    thresholds: dict[str, float],
    default_threshold: float | None = None,
) -> dict:
    """Đánh giá ngưỡng cảnh báo (alert threshold) cho từng lever (danh mục).

    ``thresholds``: dict ánh xạ category_name -> ngưỡng % (ví dụ 80 = 80% ngân
    sách). ``default_threshold``: ngưỡng áp dụng cho các lever không có trong
    ``thresholds``. Kích hoạt cảnh báo khi ``budget_usage >= threshold``.

    Trả về danh sách các lever vượt ngưỡng, sắp xếp theo mức sử dụng giảm dần.
    """

    alerts: list[dict] = []
    evaluated = 0

    for cat in categories:
        name = cat.get("name") or "Other"
        budget = cat.get("budget")
        usage = cat.get("budget_usage")
        if budget is None or budget <= 0:
            continue
        if usage is None:
            spent = float(cat.get("spent", 0))
            usage = (spent / float(budget)) * 100 if budget else 0.0

        evaluated += 1
        thr = thresholds.get(name, default_threshold)
        if thr is None:
            continue

        if usage >= thr:
            severity = "high" if usage >= max(thr, 100) else "warning"
            alerts.append({
                "lever": name,
                "budget_usage": round(float(usage), 1),
                "threshold": thr,
                "spent": round(float(cat.get("spent", 0)), 2),
                "budget": round(float(budget), 2),
                "severity": severity,
                "message": (
                    f"'{name}' đã dùng {usage:.1f}% ngân sách, "
                    f"vượt ngưỡng cảnh báo {thr}%."
                ),
            })

    alerts.sort(key=lambda a: a["budget_usage"], reverse=True)
    return {
        "alerts": alerts,
        "triggered_count": len(alerts),
        "total_evaluated": evaluated,
    }


def detect_anomalies(
    data: list[dict], amount_key: str = "total_expense", rel_threshold: float = 1.8
) -> list[dict]:
    """Phát hiện các tháng chi tiêu bất thường."""

    if len(data) < 3:
        return []

    totals = [float(row[amount_key]) for row in data]
    median = float(np.median(totals))
    if median <= 0:
        return []

    anomalies = []
    for row in data:
        amt = float(row[amount_key])
        if amt > median * rel_threshold or amt < median / rel_threshold:
            direction = "high" if amt > median else "low"
            deviation = round((amt - median) / median * 100, 1)
            anomalies.append({
                "month": f"{int(row['yr'])}-{int(row['month']):02d}",
                "amount": round(amt, 2),
                "median": round(median, 2),
                "deviation_percent": deviation,
                "direction": direction,
            })

    anomalies.sort(key=lambda a: (a["direction"] != "high", -abs(a["deviation_percent"])))
    return anomalies


def generate_savings_advice(
    predicted_expense: float,
    predicted_income: float | None,
    budget: float | None,
) -> dict:
    """Dự phóng tiết kiệm ròng (thu - chi) và đưa ra lời khuyên."""

    if predicted_income is None:
        if budget is not None and predicted_expense > budget:
            return {
                "surplus": None,
                "status": "over_budget",
                "tip": (
                    f"Chi tiêu dự kiến {predicted_expense:,.0f} vượt ngân sách "
                    f"{budget:,.0f}. Hãy cắt giảm chi tiêu không thiết yếu để "
                    "giữ đúng kế hoạch."
                ),
            }
        return {
            "surplus": None,
            "status": "no_budget",
            "tip": "Thiết lập ngân sách hàng tháng để có mục tiêu tiết kiệm cụ thể.",
        }

    surplus = round(predicted_income - predicted_expense, 2)

    if surplus > 0:
        pct = round(surplus / predicted_income * 100, 1)
        status = "surplus"
        tip = (
            f"Dự phóng thặng dư {surplus:,.0f} ({pct}% thu nhập). Hãy tự động "
            "hóa tiết kiệm hoặc đầu tư khoản này thay vì để không."
        )
    elif surplus == 0:
        status = "break_even"
        tip = "Thu nhập và chi tiêu dự kiến hòa vốn. Hãy xây dựng quỹ dự phòng cho các chi phí bất ngờ."
    else:
        deficit = abs(surplus)
        status = "deficit"
        tip = (
            f"Dự phóng thâm hụt {deficit:,.0f}. Xem lại các chi phí cố định hoặc "
            "tìm nguồn thu thêm để không phải dùng đến tiền tiết kiệm."
        )

    return {"surplus": surplus, "status": status, "tip": tip}


def recommend_actions(
    analysis: dict,
    category_analysis: dict,
    anomalies: list[dict],
    savings: dict,
) -> list[dict]:
    """Tổng hợp các hành động được khuyến nghị theo thứ tự ưu tiên."""

    actions: list[dict] = []

    if analysis.get("status") == "abnormal":
        actions.append({
            "type": "spending_spike",
            "priority": "high",
            "text": analysis.get("suggestion", ""),
        })
    if analysis.get("status") == "warning":
        actions.append({
            "type": "budget",
            "priority": "high",
            "text": analysis.get("suggestion", ""),
        })

    for cat in category_analysis.get("overspent_categories", []):
        actions.append({
            "type": "category_overspend",
            "priority": "medium",
            "text": (
                f"{cat['name']} vượt ngân sách {cat['over_amount']:,.0f} "
                f"({cat['budget_usage']}% đã dùng)."
            ),
        })

    for a in anomalies:
        if a["direction"] == "high":
            actions.append({
                "type": "anomaly",
                "priority": "medium",
                "text": f"Chi tiêu bất thường cao {a['amount']:,.0f} vào tháng {a['month']} (lệch {a['deviation_percent']}% so với mức điển hình).",
            })
        else:
            actions.append({
                "type": "anomaly",
                "priority": "medium",
                "text": f"Chi tiêu bất thường thấp {a['amount']:,.0f} vào tháng {a['month']} (lệch {a['deviation_percent']}% so với mức điển hình).",
            })

    if savings.get("status") == "deficit":
        actions.append({"type": "savings", "priority": "high", "text": savings.get("tip", "")})
    elif savings.get("status") == "surplus":
        actions.append({"type": "savings", "priority": "low", "text": savings.get("tip", "")})

    order = {"high": 0, "medium": 1, "low": 2}
    actions.sort(key=lambda x: order.get(x["priority"], 3))
    return actions
