"""Dự đoán chi tiêu bằng Linear Regression và phân tích kết quả chi tiết."""

import numpy as np
from sklearn.linear_model import LinearRegression


def predict_next_month(data: list[dict], amount_key: str = "total_expense") -> float:
    """Dùng Linear Regression dự đoán dữ liệu tháng tiếp theo."""

    # Chuyển dữ liệu sang numpy array
    totals = np.array([float(row[amount_key]) for row in data])

    # Dùng chỉ số tuần tự 0,1,2,... làm trục X thay vì tháng lịch (1-12).
    # Tránh lỗi tháng = 13 khi qua năm mới và giữ xu hướng đúng khi dữ liệu
    # trải qua nhiều năm.
    X = np.arange(len(totals)).reshape(-1, 1)
    y = totals

    # Huấn luyện mô hình
    model = LinearRegression()
    model.fit(X, y)

    # Dự đoán điểm tiếp theo (chỉ số = số tháng đã có)
    next_idx = len(totals)
    predicted = model.predict(np.array([[next_idx]]))[0]

    return round(float(predicted), 2)


def analyze(predicted: float, last_month: float, budget: float | None) -> dict:
    """Phân tích kết quả dự đoán so với tháng trước và ngân sách."""

    # Tính phần trăm tăng/giảm
    if last_month > 0:
        increase_percent = round(((predicted - last_month) / last_month) * 100, 2)
    else:
        increase_percent = 0.0

    # Mặc định: bình thường
    status = "normal"
    message = "Your spending is on track. Keep it up!"
    suggestion = "Continue maintaining your current spending habits."

    # Nếu vượt ngân sách → cảnh báo
    if budget is not None and predicted > budget:
        status = "warning"
        message = "Next month expense may exceed your budget"
        suggestion = "Reduce unnecessary spending and electricity usage"

    # Nếu tăng > 20% → bất thường
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

    # Build budget lookup
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

        # Danh mục chiếm > 30% tổng chi tiêu
        if pct_of_total > 30:
            high_spend.append(cat_info)

        categories.append(cat_info)

    # Sắp xếp danh mục vượt budget theo mức vượt giảm dần
    overspent.sort(key=lambda x: x.get("over_amount", 0), reverse=True)

    # Build structured suggestions — frontend sẽ dịch
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

    # Gợi ý phân bổ chi tiêu hợp lý
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


def detect_anomalies(
    data: list[dict], amount_key: str = "total_expense", rel_threshold: float = 1.8
) -> list[dict]:
    """Phát hiện các tháng chi tiêu bất thường.

    Dùng trung vị (median) làm tâm và cờ các tháng lệch quá `rel_threshold`
    lần so với trung vị (ví dụ 1.8 => cao hơn 80% hoặc thấp hơn 80% so với
    mức điển hình). Median bền vững hơn mean/std khi có outlier cực đoan
    (một tháng lỗi dữ liệu giá trị khổng lồ sẽ kéo mean/std lên và làm
    z-score trở nên vô nghĩa).
    """
    if len(data) < 3:
        return []

    totals = [float(row[amount_key]) for row in data]
    median = float(np.median(totals))
    # Nếu mọi giá trị đều <= 0, không thể tính tỷ lệ -> bỏ qua.
    if median <= 0:
        return []

    anomalies = []
    for row in data:
        amt = float(row[amount_key])
        if amt > median * rel_threshold or amt < median / rel_threshold:
            direction = "high" if amt > median else "low"
            deviation = round((amt - median) / median * 100, 1)
            anomalies.append(
                {
                    "month": f"{int(row['yr'])}-{int(row['month']):02d}",
                    "amount": round(amt, 2),
                    "median": round(median, 2),
                    "deviation_percent": deviation,
                    "direction": direction,
                }
            )

    # Sắp xếp: bất thường cao trước, sau đó theo |deviation| giảm dần.
    anomalies.sort(key=lambda a: (a["direction"] != "high", -abs(a["deviation_percent"])))
    return anomalies


def generate_savings_advice(
    predicted_expense: float,
    predicted_income: float | None,
    budget: float | None,
) -> dict:
    """Dự phóng tiết kiệm ròng (thu - chi) và đưa ra lời khuyên."""

    # Không có dữ liệu thu nhập → chỉ cảnh báo dựa trên ngân sách.
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
        actions.append(
            {
                "type": "spending_spike",
                "priority": "high",
                "text": analysis.get("suggestion", ""),
            }
        )
    if analysis.get("status") == "warning":
        actions.append(
            {
                "type": "budget",
                "priority": "high",
                "text": analysis.get("suggestion", ""),
            }
        )

    for cat in category_analysis.get("overspent_categories", []):
        actions.append(
            {
                "type": "category_overspend",
                "priority": "medium",
                "text": (
                    f"{cat['name']} vượt ngân sách {cat['over_amount']:,.0f} "
                    f"({cat['budget_usage']}% đã dùng)."
                ),
            }
        )

    for a in anomalies:
        if a["direction"] == "high":
            actions.append(
                {
                    "type": "anomaly",
                    "priority": "medium",
                    "text": f"Chi tiêu bất thường cao {a['amount']:,.0f} vào tháng {a['month']} (lệch {a['deviation_percent']}% so với mức điển hình).",
                }
            )
        else:
            actions.append(
                {
                    "type": "anomaly",
                    "priority": "medium",
                    "text": f"Chi tiêu bất thường thấp {a['amount']:,.0f} vào tháng {a['month']} (lệch {a['deviation_percent']}% so với mức điển hình).",
                }
            )

    if savings.get("status") == "deficit":
        actions.append({"type": "savings", "priority": "high", "text": savings.get("tip", "")})
    elif savings.get("status") == "surplus":
        actions.append({"type": "savings", "priority": "low", "text": savings.get("tip", "")})

    # Ưu tiên: high -> medium -> low
    order = {"high": 0, "medium": 1, "low": 2}
    actions.sort(key=lambda x: order.get(x["priority"], 3))
    return actions
