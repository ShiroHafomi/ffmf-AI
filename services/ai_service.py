"""Dự đoán chi tiêu bằng Linear Regression và phân tích kết quả."""

import numpy as np
from sklearn.linear_model import LinearRegression


def predict_next_month(expenses: list[dict]) -> float:
    """Dùng Linear Regression dự đoán chi tiêu tháng tiếp theo."""

    # Chuyển dữ liệu sang numpy array
    months = np.array([row["month"] for row in expenses])
    totals = np.array([float(row["total_expense"]) for row in expenses])

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
