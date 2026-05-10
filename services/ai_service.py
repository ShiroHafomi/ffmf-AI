"""Dự đoán chi tiêu bằng Linear Regression và phân tích kết quả chi tiết."""

import numpy as np
from sklearn.linear_model import LinearRegression


def predict_next_month(data: list[dict], amount_key: str = "total_expense") -> float:
    """Dùng Linear Regression dự đoán dữ liệu tháng tiếp theo."""

    # Chuyển dữ liệu sang numpy array
    months = np.array([row["month"] for row in data])
    totals = np.array([float(row[amount_key]) for row in data])

    # Reshape X thành 2D
    X = months.reshape(-1, 1)
    y = totals

    # Huấn luyện mô hình
    model = LinearRegression()
    model.fit(X, y)

    # Dự đoán tháng tiếp theo
    next_month = int(months[-1]) + 1
    predicted = model.predict(np.array([[next_month]]))[0]

    return round(predicted, 2)


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
