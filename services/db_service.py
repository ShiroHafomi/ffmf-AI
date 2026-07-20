"""Truy vấn dữ liệu chi tiêu và ngân sách từ MySQL."""

from datetime import datetime

from db.connection import get_connection


def get_monthly_expenses(household_id: int) -> list[dict]:
    """Lấy tổng chi tiêu theo tháng (tối đa 6 tháng gần nhất, cũ -> mới)."""
    # Khởi tạo None trước try: nếu get_connection() ném lỗi thì `connection`
    # vẫn được gán (None) và khối finally không bắn NameError.
    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)

        # Tổng chi tiêu nhóm theo NĂM + THÁNG, sắp xếp tăng dần
        # (cũ nhất trước) để mỗi phần tử là một tháng độc lập, không bị
        # gộp các tháng trùng số giữa các năm.
        query = """
            SELECT
                YEAR(expense_date)  AS yr,
                MONTH(expense_date) AS month,
                SUM(amount)         AS total_expense
            FROM expenses
            WHERE household_id = %s
            GROUP BY yr, month
            ORDER BY yr ASC, month ASC
            LIMIT 6
        """

        cursor.execute(query, (household_id,))
        results = cursor.fetchall()
        return results

    finally:
        # Đóng kết nối (chỉ khi đã mở thành công)
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def get_monthly_incomes(household_id: int) -> list[dict]:
    """Lấy tổng thu nhập theo tháng (tối đa 6 tháng gần nhất, cũ -> mới)."""
    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)

        # Tổng thu nhập nhóm theo NĂM + THÁNG, sắp xếp tăng dần.
        query = """
            SELECT
                YEAR(income_date)   AS yr,
                MONTH(income_date)  AS month,
                SUM(amount)         AS total_income
            FROM incomes
            WHERE household_id = %s
            GROUP BY yr, month
            ORDER BY yr ASC, month ASC
            LIMIT 6
        """

        cursor.execute(query, (household_id,))
        results = cursor.fetchall()
        return results

    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def get_latest_budget(household_id: int) -> float | None:
    """Lấy TỔNG ngân sách mới nhất (theo năm và tháng gần nhất) của hộ.

    Một hộ có thể có nhiều ngân sách theo từng danh mục cho cùng một
    tháng. Hàm này cộng gộp (SUM) tất cả các khoản đó của tháng mới nhất
    thay vì chỉ lấy 1 dòng bất kỳ.
    """
    connection = None
    cursor = None

    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)

        # Tìm (năm, tháng) mới nhất của hộ, sau đó cộng gộp toàn bộ
        # ngân sách của tháng đó.
        query = """
            SELECT SUM(b.amount) AS amount
            FROM budgets b
            JOIN (
                SELECT year, month
                FROM budgets
                WHERE household_id = %s
                ORDER BY year DESC, month DESC
                LIMIT 1
            ) latest
              ON b.year = latest.year
             AND b.month = latest.month
            WHERE b.household_id = %s
        """

        cursor.execute(query, (household_id, household_id))
        result = cursor.fetchone()
        return float(result["amount"]) if result and result["amount"] is not None else None

    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def get_category_expenses(household_id: int, month: int = None, year: int = None) -> list[dict]:
    """Lấy chi tiêu theo danh mục của tháng hiện tại."""
    if month is None:
        month = datetime.now().month
    if year is None:
        year = datetime.now().year

    connection = None
    cursor = None

    try:
        connection = get_connection()
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
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def get_monthly_category_expenses(
    household_id: int, months: int = 6
) -> list[dict]:
    """Lấy tổng chi tiêu theo danh mục + tháng (6 tháng gần nhất) để dự báo
    theo danh mục. Gom nhóm theo danh mục, năm, tháng."""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        query = """
            SELECT
                COALESCE(c.name, 'Other') AS category_name,
                YEAR(e.expense_date)  AS yr,
                MONTH(e.expense_date) AS month,
                SUM(e.amount)         AS total
            FROM expenses e
            LEFT JOIN categories c ON e.category_id = c.id
            WHERE e.household_id = %s
              AND e.expense_date >= DATE_SUB(CURDATE(), INTERVAL %s MONTH)
            GROUP BY c.name, yr, month
            ORDER BY yr ASC, month ASC
        """
        cursor.execute(query, (household_id, int(months)))
        return cursor.fetchall()
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def get_category_budgets(
    household_id: int, month: int = None, year: int = None
) -> list[dict]:
    """Lấy ngân sách theo danh mục của tháng hiện tại."""
    if month is None:
        month = datetime.now().month
    if year is None:
        year = datetime.now().year

    connection = None
    cursor = None

    try:
        connection = get_connection()
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
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


# ───────────────────────── Expense CRUD ─────────────────────────
def category_belongs_to_household(household_id: int, category_id: int) -> bool:
    """True nếu category_id thuộc về household (dùng cho authz)."""
    if category_id is None or category_id <= 0:
        return False

    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT 1 AS ok FROM categories WHERE id = %s AND household_id = %s",
            (category_id, household_id),
        )
        return cursor.fetchone() is not None
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def insert_expense(
    household_id: int,
    amount: float,
    category_id: int | None,
    expense_date: str | None,
    description: str | None,
    user_id: int | None = None,
) -> int:
    """Thêm một khoản chi tiêu mới, trả về id vừa tạo."""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO expenses
                (household_id, category_id, amount, description, user_id, expense_date)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                household_id,
                category_id,
                amount,
                description,
                user_id,
                expense_date,
            ),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def list_expenses(household_id: int | None, limit: int = 50) -> list[dict]:
    """Lấy danh sách chi tiêu (mới nhất trước), tuỳ chọn theo hộ."""
    safe_limit = 50
    try:
        lim = int(limit)
        if lim > 0:
            safe_limit = min(lim, 200)
    except (TypeError, ValueError):
        pass

    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        if household_id is not None:
            cursor.execute(
                """
                SELECT e.id, e.household_id, e.category_id, e.amount,
                       e.description, e.expense_date, e.user_id,
                       c.name AS category_name
                FROM expenses e
                LEFT JOIN categories c ON e.category_id = c.id
                WHERE e.household_id = %s
                ORDER BY e.expense_date DESC, e.id DESC
                LIMIT %s
                """,
                (household_id, safe_limit),
            )
        else:
            cursor.execute(
                """
                SELECT e.id, e.household_id, e.category_id, e.amount,
                       e.description, e.expense_date, e.user_id,
                       c.name AS category_name
                FROM expenses e
                LEFT JOIN categories c ON e.category_id = c.id
                ORDER BY e.expense_date DESC, e.id DESC
                LIMIT %s
                """,
                (safe_limit,),
            )
        return cursor.fetchall()
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def get_expense_by_id(expense_id: int) -> dict | None:
    """Lấy một khoản chi tiêu theo id (kèm tên danh mục)."""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT e.id, e.household_id, e.category_id, e.amount,
                   e.description, e.expense_date, e.user_id,
                   c.name AS category_name
            FROM expenses e
            LEFT JOIN categories c ON e.category_id = c.id
            WHERE e.id = %s
            """,
            (expense_id,),
        )
        return cursor.fetchone()
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def update_expense(
    expense_id: int,
    amount: float | None = None,
    category_id: int | None = None,
    expense_date: str | None = None,
    description: str | None = None,
) -> bool:
    """Cập nhật các trường được truyền (None = giữ nguyên). Trả về
    True nếu có dòng bị ảnh hưởng (tồn tại)."""
    fields: list[str] = []
    params: list = []
    if amount is not None:
        fields.append("amount = %s")
        params.append(amount)
    if category_id is not None:
        fields.append("category_id = %s")
        params.append(category_id)
    if expense_date is not None:
        fields.append("expense_date = %s")
        params.append(expense_date)
    if description is not None:
        fields.append("description = %s")
        params.append(description)

    if not fields:
        # Không có gì để cập nhật — coi như thành công (id hợp lệ).
        return True

    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            f"UPDATE expenses SET {', '.join(fields)} WHERE id = %s",
            params + [expense_id],
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def delete_expense(expense_id: int) -> bool:
    """Xoá một khoản chi tiêu. Trả về True nếu có dòng bị xoá."""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute("DELETE FROM expenses WHERE id = %s", (expense_id,))
        connection.commit()
        return cursor.rowcount > 0
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


# ───────────────────────── Auth / users ─────────────────────────
def email_exists(email: str) -> bool:
    """True nếu email đã được đăng ký (dùng cho register)."""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute("SELECT 1 AS ok FROM users WHERE email = %s", (email,))
        return cursor.fetchone() is not None
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def create_user(email: str, password_hash: str, name: str | None = None) -> int:
    """Tạo user mới, khớp convention của Node backend:
      display_id = 'U' + 8 hex (randomBytes(4)), role_id = 3 (Member),
      status = 1. Trả về id vừa tạo.
    """
    import secrets

    display_id = "U" + secrets.token_hex(4).upper()
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            """
            INSERT INTO users (display_id, email, name, password_hash, role_id, status)
            VALUES (%s, %s, %s, %s, 3, 1)
            """,
            (display_id, email, name, password_hash),
        )
        connection.commit()
        return int(cursor.lastrowid)
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def find_user_by_id(user_id: int) -> dict | None:
    """Lấy user công khai (không có password_hash), kèm household_role."""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT u.id, u.email, u.full_name, u.name, u.role_id,
                   u.household_id, u.status,
                   hm.role AS household_role
            FROM users u
            LEFT JOIN household_members hm
              ON hm.user_id = u.id AND hm.household_id = u.household_id
            WHERE u.id = %s
            """,
            (user_id,),
        )
        return cursor.fetchone()
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()
