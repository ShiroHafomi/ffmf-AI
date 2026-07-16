"""Truy vấn dữ liệu chi tiêu và ngân sách từ MySQL."""

from datetime import datetime

from db.connection import get_connection


def get_monthly_expenses(household_id: int) -> list[dict]:
    """Lấy tổng chi tiêu theo tháng (tối đa 6 tháng gần nhất, cũ -> mới)."""
    # Lấy kết nối TRƯỚC try để tránh NameError trong finally
    # nếu get_connection() ném lỗi.
    connection = get_connection()
    cursor = None

    try:
        cursor = connection.cursor(dictionary=True)

        # Tổng chi tiêu nhóm theo NĂM + THÁNG, sắp xếp tăng dần
        # (cũ nhất trước) để mỗi phần tử là một tháng độc lập, không bị
        # gộp các tháng trùng số giữa các năm.
        query = """
            SELECT
                YEAR(expense_date)  AS yr,
                MONTH(expense_date) AS month,
                SUM(amount)         AS total_expense
            FROM EXPENSES
            WHERE household_id = %s
            GROUP BY yr, month
            ORDER BY yr ASC, month ASC
            LIMIT 6
        """

        cursor.execute(query, (household_id,))
        results = cursor.fetchall()
        return results

    finally:
        # Đóng kết nối
        if connection.is_connected():
            if cursor:
                cursor.close()
            connection.close()


def get_monthly_incomes(household_id: int) -> list[dict]:
    """Lấy tổng thu nhập theo tháng (tối đa 6 tháng gần nhất, cũ -> mới)."""
    connection = get_connection()
    cursor = None

    try:
        cursor = connection.cursor(dictionary=True)

        # Tổng thu nhập nhóm theo NĂM + THÁNG, sắp xếp tăng dần.
        query = """
            SELECT
                YEAR(income_date)   AS yr,
                MONTH(income_date)  AS month,
                SUM(amount)         AS total_income
            FROM INCOMES
            WHERE household_id = %s
            GROUP BY yr, month
            ORDER BY yr ASC, month ASC
            LIMIT 6
        """

        cursor.execute(query, (household_id,))
        results = cursor.fetchall()
        return results

    finally:
        if connection.is_connected():
            if cursor:
                cursor.close()
            connection.close()


def get_latest_budget(household_id: int) -> float | None:
    """Lấy TỔNG ngân sách mới nhất (theo năm và tháng gần nhất) của hộ.

    Một hộ có thể có nhiều ngân sách theo từng danh mục cho cùng một
    tháng. Hàm này cộng gộp (SUM) tất cả các khoản đó của tháng mới nhất
    thay vì chỉ lấy 1 dòng bất kỳ.
    """
    connection = get_connection()
    cursor = None

    try:
        # Tìm (năm, tháng) mới nhất của hộ, sau đó cộng gộp toàn bộ
        # ngân sách của tháng đó.
        query = """
            SELECT SUM(b.amount) AS amount
            FROM BUDGETS b
            JOIN (
                SELECT year, month
                FROM BUDGETS
                WHERE household_id = %s
                ORDER BY year DESC, month DESC
                LIMIT 1
            ) latest
              ON b.year = latest.year
             AND b.month = latest.month
            WHERE b.household_id = %s
        """

        cursor = connection.cursor(dictionary=True)
        cursor.execute(query, (household_id, household_id))
        result = cursor.fetchone()
        return float(result["amount"]) if result and result["amount"] is not None else None

    finally:
        if connection.is_connected():
            if cursor:
                cursor.close()
            connection.close()


def get_category_expenses(household_id: int, month: int = None, year: int = None) -> list[dict]:
    """Lấy chi tiêu theo danh mục của tháng hiện tại."""
    if month is None:
        month = datetime.now().month
    if year is None:
        year = datetime.now().year

    connection = get_connection()
    cursor = None

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
            if cursor:
                cursor.close()
            connection.close()


def get_category_budgets(household_id: int, month: int = None, year: int = None) -> list[dict]:
    """Lấy ngân sách theo danh mục của tháng hiện tại."""
    if month is None:
        month = datetime.now().month
    if year is None:
        year = datetime.now().year

    connection = get_connection()
    cursor = None

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
            if cursor:
                cursor.close()
            connection.close()
