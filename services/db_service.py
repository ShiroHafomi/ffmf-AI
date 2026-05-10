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


def get_monthly_incomes(household_id: int) -> list[dict]:
    """Lấy tổng thu nhập theo tháng (tối đa 6 tháng gần nhất)."""
    connection = get_connection()

    try:
        cursor = connection.cursor(dictionary=True)

        # Tổng thu nhập nhóm theo tháng, sắp xếp tăng dần
        query = """
            SELECT
                MONTH(income_date) AS month,
                SUM(amount)        AS total_income
            FROM INCOMES
            WHERE household_id = %s
            GROUP BY MONTH(income_date)
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


def get_category_expenses(household_id: int, month: int = None, year: int = None) -> list[dict]:
    """Lấy chi tiêu theo danh mục của tháng hiện tại."""
    from datetime import datetime

    if month is None:
        month = datetime.now().month
    if year is None:
        year = datetime.now().year

    connection = get_connection()

    try:
        cursor = connection.cursor(dictionary=True)

        query = """
            SELECT
                c.name AS category_name,
                SUM(e.amount) AS total,
                COUNT(e.id) AS transaction_count
            FROM expenses e
            LEFT JOIN categories c ON e.category_id = c.id
            WHERE e.household_id = %s
              AND MONTH(e.expense_date) = %s
              AND YEAR(e.expense_date) = %s
            GROUP BY c.id, c.name
            ORDER BY total DESC
        """

        cursor.execute(query, (household_id, month, year))
        results = cursor.fetchall()
        return results

    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()


def get_category_budgets(household_id: int, month: int = None, year: int = None) -> list[dict]:
    """Lấy ngân sách theo danh mục của tháng hiện tại."""
    from datetime import datetime

    if month is None:
        month = datetime.now().month
    if year is None:
        year = datetime.now().year

    connection = get_connection()

    try:
        cursor = connection.cursor(dictionary=True)

        query = """
            SELECT
                c.name AS category_name,
                b.amount AS budget_amount
            FROM budgets b
            LEFT JOIN categories c ON b.category_id = c.id
            WHERE b.household_id = %s
              AND b.month = %s
              AND b.year = %s
        """

        cursor.execute(query, (household_id, month, year))
        results = cursor.fetchall()
        return results

    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()
