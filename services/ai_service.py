"""Dự đoán chi tiêu bằng Linear Regression và phân tích kết quả."""

import numpy as np
from sklearn.linear_model import LinearRegression


def predict_next_month(expenses: list[dict]) -> float:
    """Dùng Linear Regression dự đoán chi tiêu tháng tiếp theo."""

    # Tổng chi tiêu theo thứ tự thời gian (đã sắp xếp giảm dần từ DB,
    # nên đảo lại để cũ -> mới).
    totals = np.array(
        [float(row["total_expense"]) for row in reversed(expenses)]
    )

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
