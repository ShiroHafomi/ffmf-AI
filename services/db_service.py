"""Truy vấn dữ liệu chi tiêu và ngân sách từ MySQL."""

from db.connection import get_connection


def get_monthly_expenses(household_id: int) -> list[dict]:
    """Lấy tổng chi tiêu theo tháng (tối đa 6 tháng gần nhất)."""
    connection = get_connection()

    try:
        cursor = connection.cursor(dictionary=True)

        # Tổng chi tiêu nhóm theo tháng, sắp xếp tăng dần
        query = """
            SELECT
                MONTH(expense_date) AS month,
                SUM(amount)         AS total_expense
            FROM EXPENSES
            WHERE household_id = %s
            GROUP BY MONTH(expense_date)
            ORDER BY month
            LIMIT 6
        """

        cursor.execute(query, (household_id,))
        results = cursor.fetchall()
        return results

    finally:
        # Đóng kết nối
        if connection.is_connected():
            cursor.close()
            connection.close()


def get_latest_budget(household_id: int) -> float | None:
    """Lấy ngân sách mới nhất của hộ gia đình."""
    connection = get_connection()

    try:
        cursor = connection.cursor(dictionary=True)

        # Lấy ngân sách gần nhất theo năm và tháng
        query = """
            SELECT amount
            FROM BUDGETS
            WHERE household_id = %s
            ORDER BY year DESC, month DESC
            LIMIT 1
        """

        cursor.execute(query, (household_id,))
        result = cursor.fetchone()
        return float(result["amount"]) if result else None

    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()
