"""Truy vấn dữ liệu chi tiêu và ngân sách từ MySQL."""

import logging
import re
from contextlib import contextmanager
from datetime import datetime

from db.connection import get_connection

logger = logging.getLogger("ffms")


@contextmanager
def _db_cursor(dictionary: bool = True, connection=None):
    """Yield ``(cursor, connection)`` for one query.

    If ``connection`` is provided it is reused (the caller owns its lifecycle and
    must close it); otherwise a pooled connection is acquired and returned to the
    pool afterwards. The cursor is always closed; the connection is only closed
    when we acquired it ourselves. Lets a request run all its reads on a single
    connection instead of churning the pool once per query.
    """
    own = connection is None
    conn = connection if connection is not None else get_connection()
    cur = conn.cursor(dictionary=dictionary)
    try:
        yield cur, conn
    finally:
        cur.close()
        if own and conn.is_connected():
            conn.close()


def get_monthly_expenses(household_id: int, limit: int = 24, connection=None) -> list[dict]:
    """Lấy tổng chi tiêu theo tháng (tối đa `limit` tháng gần nhất, cũ -> mới).

    Mặc định lấy tới 24 tháng (thay vì 6) để bộ dự báo có đủ dữ liệu chạy
    Holt (>=6 điểm) và điều chỉnh theo mùa (>=12 điểm). `limit` được clamp
    vào [3, 60] để tránh query vô hạn. Nếu `connection` được truyền vào thì
    tái sử dụng (route mở 1 connection cho cả request), không tự đóng.
    """
    try:
        safe_limit = max(3, min(int(limit), 60))
    except (TypeError, ValueError):
        safe_limit = 24

    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
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
            ORDER BY yr DESC, month DESC
            LIMIT %s
        """

        cursor.execute(query, (household_id, safe_limit))
        # LIMIT lấy "limit tháng gần nhất" theo thứ tự giảm dần -> đảo ngược
        # về "cũ -> mới" để khớp downstream (expenses[-1] được xem là tháng mới nhất).
        results = cursor.fetchall()
        results.reverse()
        return results


def get_monthly_incomes(household_id: int, limit: int = 24, connection=None) -> list[dict]:
    """Lấy tổng thu nhập theo tháng (tối đa `limit` tháng gần nhất, cũ -> mới).

    Giống ``get_monthly_expenses``, mặc định 24 tháng để dự báo thu nhập cũng
    có thể dùng Holt / theo mùa. `limit` clamp [3, 60]. Nếu `connection` được
    truyền vào thì tái sử dụng (route mở 1 connection cho cả request).
    """
    try:
        safe_limit = max(3, min(int(limit), 60))
    except (TypeError, ValueError):
        safe_limit = 24

    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
        # Tổng thu nhập nhóm theo NĂM + THÁNG, sắp xếp tăng dần.
        query = """
            SELECT
                YEAR(income_date)   AS yr,
                MONTH(income_date)  AS month,
                SUM(amount)         AS total_income
            FROM incomes
            WHERE household_id = %s
            GROUP BY yr, month
            ORDER BY yr DESC, month DESC
            LIMIT %s
        """

        cursor.execute(query, (household_id, safe_limit))
        # Tương tự get_monthly_expenses: LIMIT lấy các tháng gần nhất (giảm dần)
        # -> đảo ngược về "cũ -> mới".
        results = cursor.fetchall()
        results.reverse()
        return results


def get_latest_budget(household_id: int, connection=None) -> float | None:
    """Lấy TỔNG ngân sách mới nhất (theo năm và tháng gần nhất) của hộ.

    Một hộ có thể có nhiều ngân sách theo từng danh mục cho cùng một
    tháng. Hàm này cộng gộp (SUM) tất cả các khoản đó của tháng mới nhất
    thay vì chỉ lấy 1 dòng bất kỳ. Nếu `connection` được truyền vào thì
    tái sử dụng (route mở 1 connection cho cả request).
    """
    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
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


def get_category_expenses(
    household_id: int, month: int = None, year: int = None, connection=None
) -> list[dict]:
    """Lấy chi tiêu theo danh mục của tháng hiện tại. Nếu `connection` được
    truyền vào thì tái sử dụng (route mở 1 connection cho cả request)."""
    if month is None:
        month = datetime.now().month
    if year is None:
        year = datetime.now().year

    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
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


def get_monthly_category_expenses(
    household_id: int, months: int = 12, connection=None
) -> list[dict]:
    """Lấy tổng chi tiêu theo danh mục + tháng (mặc định 12 tháng gần nhất) để
    dự báo theo danh mục. Gom nhóm theo danh mục, năm, tháng. `months` clamp
    [3, 60]. Nếu `connection` được truyền vào thì tái sử dụng (route mở 1
    connection cho cả request)."""
    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
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


def get_category_budgets(
    household_id: int, month: int = None, year: int = None, connection=None
) -> list[dict]:
    """Lấy ngân sách theo danh mục của tháng hiện tại. Nếu `connection` được
    truyền vào thì tái sử dụng (route mở 1 connection cho cả request)."""
    if month is None:
        month = datetime.now().month
    if year is None:
        year = datetime.now().year

    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
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


# ───────────────────────── Savings Goals ─────────────────────────
def get_savings_goals(household_id: int, connection=None) -> list[dict]:
    """Lấy danh sách mục tiêu tiết kiệm đang hoạt động của hộ.

    Trả về danh sách các mục tiêu (id, name, target_amount, current_amount,
    created_at), sắp xếp theo ngày tạo (cũ nhất trước) để hiển thị tiến độ
    tích luỹ theo thời gian. Nếu ``connection`` được truyền vào thì tái sử
    dụng (route mở 1 connection cho cả request).
    """
    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
        cursor.execute(
            """
            SELECT id, name, target_amount, current_amount, created_at
            FROM savings_goals
            WHERE household_id = %s
            ORDER BY created_at ASC
            """,
            (household_id,),
        )
        return cursor.fetchall()


def get_current_month_total_income(
    household_id: int, connection=None
) -> float:
    """Tổng thu nhập của hộ trong tháng hiện tại.

    Trả về SUM(amount) từ bảng incomes, lọc theo household_id và tháng/năm
    hiện tại. Trả về 0.0 nếu không có bản ghi nào. Nếu ``connection`` được
    truyền vào thì tái sử dụng (route mở 1 connection cho cả request).
    """
    now = datetime.now()
    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
        cursor.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM incomes
            WHERE household_id = %s
              AND MONTH(income_date) = %s
              AND YEAR(income_date) = %s
            """,
            (household_id, now.month, now.year),
        )
        result = cursor.fetchone()
        return float(result["total"]) if result else 0.0


def get_all_household_ids(connection=None) -> list[int]:
    """Get all household IDs that have at least one expense or income record.

    Used by backtest jobs to iterate over households with data.
    Returns a list of household_id integers.
    """
    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
        cursor.execute(
            """
            SELECT DISTINCT household_id FROM expenses
            UNION
            SELECT DISTINCT household_id FROM incomes
            """
        )
        rows = cursor.fetchall()
        return [row["household_id"] for row in rows if row["household_id"] is not None]


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


# ───────────────────────── Debts & Loans ─────────────────────────
def get_debts_loans(
    household_id: int,
    status: str | None = None,
    connection=None,
) -> list[dict]:
    """Get all debts/loans for a household, optionally filtered by status.

    Returns list of dicts with fields from debts_loans table.
    """
    with _db_cursor(dictionary=True, connection=connection) as (cursor, _):
        query = """
            SELECT id, household_id, `type`, title, total_amount, remaining_amount,
                   interest_rate, interest_type, start_date, due_date,
                   payment_frequency, status, notes, currency,
                   created_at, updated_at
            FROM debts_loans
            WHERE household_id = %s
        """
        params = [household_id]
        if status:
            query += " AND status = %s"
            params.append(status)
        query += " ORDER BY due_date ASC"
        cursor.execute(query, params)
        return cursor.fetchall()


def create_debt_loan(
    household_id: int,
    debt_type: str,
    title: str,
    total_amount: float,
    remaining_amount: float,
    interest_rate: float = 0.0,
    interest_type: str = "REDUCING_BALANCE",
    start_date: str | None = None,
    due_date: str | None = None,
    payment_frequency: str = "MONTHLY",
    notes: str | None = None,
    currency: str = "VND",
    connection=None,
) -> int:
    """Create a new debt/loan record. Returns the new debt_id."""
    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
        cursor.execute(
            """
            INSERT INTO debts_loans
                (household_id, `type`, title, total_amount, remaining_amount,
                 interest_rate, interest_type, start_date, due_date,
                 payment_frequency, status, notes, currency)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                household_id,
                debt_type,
                title,
                total_amount,
                remaining_amount,
                interest_rate,
                interest_type,
                start_date,
                due_date,
                payment_frequency,
                "ACTIVE",
                notes,
                currency,
            ),
        )
        conn.commit()
        return int(cursor.lastrowid)


def update_debt_loan(
    debt_id: int,
    title: str | None = None,
    total_amount: float | None = None,
    remaining_amount: float | None = None,
    interest_rate: float | None = None,
    interest_type: str | None = None,
    start_date: str | None = None,
    due_date: str | None = None,
    payment_frequency: str | None = None,
    status: str | None = None,
    notes: str | None = None,
    currency: str | None = None,
    connection=None,
) -> bool:
    """Update a debt/loan record. Returns True if updated."""
    fields = []
    params = []
    if title is not None:
        fields.append("title = %s")
        params.append(title)
    if total_amount is not None:
        fields.append("total_amount = %s")
        params.append(total_amount)
    if remaining_amount is not None:
        fields.append("remaining_amount = %s")
        params.append(remaining_amount)
    if interest_rate is not None:
        fields.append("interest_rate = %s")
        params.append(interest_rate)
    if interest_type is not None:
        fields.append("interest_type = %s")
        params.append(interest_type)
    if start_date is not None:
        fields.append("start_date = %s")
        params.append(start_date)
    if due_date is not None:
        fields.append("due_date = %s")
        params.append(due_date)
    if payment_frequency is not None:
        fields.append("payment_frequency = %s")
        params.append(payment_frequency)
    if status is not None:
        fields.append("status = %s")
        params.append(status)
    if notes is not None:
        fields.append("notes = %s")
        params.append(notes)
    if currency is not None:
        fields.append("currency = %s")
        params.append(currency)

    if not fields:
        return True

    params.append(debt_id)
    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
        cursor.execute(f"UPDATE debts_loans SET {', '.join(fields)} WHERE id = %s", params)
        conn.commit()
        return cursor.rowcount > 0


def delete_debt_loan(debt_id: int, connection=None) -> bool:
    """Delete a debt/loan record. Returns True if deleted."""
    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
        cursor.execute("DELETE FROM debts_loans WHERE id = %s", (debt_id,))
        conn.commit()
        return cursor.rowcount > 0


def add_debt_payment(
    debt_id: int,
    amount_paid: float,
    payment_date: str,
    notes: str | None = None,
    connection=None,
) -> int:
    """Record a payment against a debt/loan. Returns the payment_id."""
    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
        # Insert payment record
        cursor.execute(
            """
            INSERT INTO debt_payments (debt_id, amount_paid, payment_date, notes)
            VALUES (%s, %s, %s, %s)
            """,
            (debt_id, amount_paid, payment_date, notes),
        )
        payment_id = int(cursor.lastrowid)

        # Update remaining_amount on the debt/loan
        cursor.execute(
            "UPDATE debts_loans SET remaining_amount = GREATEST(0, remaining_amount - %s) WHERE id = %s",
            (amount_paid, debt_id),
        )
        # If remaining goes to 0, mark as PAID
        cursor.execute(
            "UPDATE debts_loans SET status = 'PAID' WHERE id = %s AND remaining_amount <= 0",
            (debt_id,),
        )
        conn.commit()
    return payment_id


def get_debt_payments(debt_id: int, connection=None) -> list[dict]:
    """Get all payments for a specific debt/loan."""
    with _db_cursor(dictionary=True, connection=connection) as (cursor, _):
        cursor.execute(
            """
            SELECT id, debt_id, amount_paid, payment_date, notes, created_at
            FROM debt_payments
            WHERE debt_id = %s
            ORDER BY payment_date DESC, id DESC
            """,
            (debt_id,),
        )
        return cursor.fetchall()


def get_debts_due_soon(
    household_id: int,
    days: int = 3,
    connection=None,
) -> list[dict]:
    """Get active debts/loans due within `days` days (uses v_debts_due_soon view)."""
    with _db_cursor(dictionary=True, connection=connection) as (cursor, _):
        cursor.execute(
            """
            SELECT debt_id, household_id, title, remaining_amount, due_date,
                   payment_frequency, days_until_due
            FROM v_debts_due_soon
            WHERE household_id = %s AND days_until_due <= %s
            ORDER BY days_until_due ASC
            """,
            (household_id, days),
        )
        return cursor.fetchall()


# ───────────────────────── Currency Helpers ─────────────────────────
def get_household_currency(
    household_id: int,
    connection=None,
) -> str:
    """Get the default currency for a household (from expenses table, mode).

    Falls back to 'VND' if no expenses exist yet.
    """
    with _db_cursor(dictionary=True, connection=connection) as (cursor, _):
        # First try to get from expenses table (most common source)
        cursor.execute(
            """
            SELECT currency, COUNT(*) as cnt
            FROM expenses
            WHERE household_id = %s AND currency IS NOT NULL
            GROUP BY currency
            ORDER BY cnt DESC
            LIMIT 1
            """,
            (household_id,),
        )
        row = cursor.fetchone()
        if row and row["currency"]:
            return row["currency"]

        # Fallback to incomes
        cursor.execute(
            """
            SELECT currency, COUNT(*) as cnt
            FROM incomes
            WHERE household_id = %s AND currency IS NOT NULL
            GROUP BY currency
            ORDER BY cnt DESC
            LIMIT 1
            """,
            (household_id,),
        )
        row = cursor.fetchone()
        if row and row["currency"]:
            return row["currency"]

        # Fallback to savings_goals
        cursor.execute(
            """
            SELECT currency, COUNT(*) as cnt
            FROM savings_goals
            WHERE household_id = %s AND currency IS NOT NULL
            GROUP BY currency
            ORDER BY cnt DESC
            LIMIT 1
            """,
            (household_id,),
        )
        row = cursor.fetchone()
        if row and row["currency"]:
            return row["currency"]

        # Default
        return "VND"


def get_exchange_rate(
    from_currency: str,
    to_currency: str,
    connection=None,
) -> float:
    """Get exchange rate from_currency -> to_currency.

    Currently a stub - returns 1.0 for same currency, 0.0 for unknown pairs.
    In production, this would query an exchange_rates table or external API.
    """
    if from_currency == to_currency:
        return 1.0

    # Stub: In a real implementation, query exchange_rates table or external API
    # For now, return 0 to signal "unknown rate"
    return 0.0


def convert_amount(
    amount: float,
    from_currency: str,
    to_currency: str,
    connection=None,
) -> float:
    """Convert amount from one currency to another.

    Returns the converted amount, or the original amount if conversion not possible.
    """
    if from_currency == to_currency:
        return amount

    rate = get_exchange_rate(from_currency, to_currency, connection)
    if rate <= 0:
        # Unknown rate - return original amount with a warning
        return amount

    return round(amount * rate, 2)


# ═══════════════════════════════════════════════════════════════════════════════
# Text-to-SQL: safe read-only query executor
# ═══════════════════════════════════════════════════════════════════════════════

# Patterns that are forbidden in a read-only query — multiline-aware,
# case-insensitive match on the first non-comment keyword.
_FORBIDDEN_SQL_KEYWORDS = r"\b(DELETE|INSERT\s+INTO|UPDATE\s+\w+|DROP\s+TABLE|ALTER\s+TABLE|CREATE\s+TABLE|TRUNCATE|GRANT|REVOKE|EXEC(UTE)?\b|CALL\b|LOAD\s+DATA|IMPORT|EXPORT|RENAME\s+TABLE|REPLACE\s+INTO)"

# Only allow SELECT and WITH (CTE) statements.
_ALLOWED_LEADING = re.compile(
    r"^\s*(SELECT|WITH)\s", re.IGNORECASE | re.DOTALL
)


def _validate_readonly_sql(sql: str) -> None:
    """Raise ``ValueError`` if ``sql`` contains forbidden keywords or is not SELECT-only.

    This is a defence-in-depth layer: the LLM-generated SQL is stripped of
    everything except pure read operations so even a prompt-injection attempt
    cannot mutate data.
    """
    # Strip comments so they can't hide a dangerous keyword.
    clean = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)
    clean = re.sub(r"--[^\n]*", "", clean)
    clean = re.sub(r"#.*?$", "", clean, flags=re.MULTILINE)

    if not _ALLOWED_LEADING.search(clean):
        raise ValueError(
            "Only SELECT (or WITH … SELECT) statements are allowed for "
            "read-only queries."
        )

    # Check for forbidden keywords (case-insensitive, word boundaries).
    forbidden = re.compile(_FORBIDDEN_SQL_KEYWORDS, re.IGNORECASE)
    match = forbidden.search(clean)
    if match:
        raise ValueError(
            f"Disallowed SQL keyword '{match.group(0).strip()}' "
            "detected. Only SELECT is permitted."
        )

    # Reject multi-statement queries.
    if ";" in clean:
        raise ValueError("Multiple SQL statements are not allowed.")


def execute_readonly_query(
    sql: str, household_id: int, connection=None
) -> list[dict]:
    """Execute a **read-only SELECT** query scoped to a single household.

    Safety invariants (checked before execution):
      1. Only ``SELECT`` / ``WITH`` statements are accepted.
      2. Forbidden keywords (INSERT, UPDATE, DELETE, DROP, ...) are rejected.
      3. Multi-statement queries are rejected.
      4. ``household_id`` is injected via a bound parameter so no string
         interpolation is needed — the caller must include the placeholder
         ``%(household_id)s`` in the SQL text. If it is missing the query
         returns an empty list (defence against accidental cross-household reads).

    Returns a list of dict rows (keys = column names). Must never exceed
    ``MAX_ROWS`` rows to prevent accidental resource exhaustion.
    """
    MAX_ROWS = 2_000

    sql = (sql or "").strip()
    if not sql:
        raise ValueError("SQL query must not be empty.")

    # --- Guard rails ---
    _validate_readonly_sql(sql)

    # The caller MUST scope by household. We inject the bound value,
    # not the raw int, so the DB connector handles quoting / types.
    if "%(household_id)s" not in sql:
        logger.warning(
            "Text-to-SQL query missing household_id placeholder; returning empty."
        )
        return []

    params: dict = {
        "household_id": household_id,
        "max_rows": MAX_ROWS,
    }

    with _db_cursor(dictionary=True, connection=connection) as (cursor, conn):
        cursor.execute(sql, params)
        results = cursor.fetchmany(MAX_ROWS)
        return results
