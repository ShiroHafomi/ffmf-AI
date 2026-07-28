"""Admin service — system-wide queries for the admin dashboard.

All functions are stateless and operate on the MySQL database directly.
They are designed to be called from admin routes with a shared DB connection
to minimize pool churn per request.
"""

from contextlib import contextmanager
from datetime import datetime
from typing import Optional
import time
import secrets
import bcrypt

from db.connection import get_connection


# ───────────────────────── Connection helper ─────────────────────────
@contextmanager
def _db_cursor(dictionary: bool = True, connection=None):
    """Yield (cursor, connection) for one query, reusing caller's connection."""
    own = connection is None
    conn = connection if connection is not None else get_connection()
    cur = conn.cursor(dictionary=dictionary)
    try:
        yield cur, conn
    finally:
        cur.close()
        if own and conn.is_connected():
            conn.close()


# ───────────────────────── System overview ─────────────────────────
def get_system_summary(connection=None) -> dict:
    """Aggregate counts for the admin home stats cards."""
    with _db_cursor(connection=connection) as (cursor, _):
        cursor.execute("SELECT COUNT(*) AS n FROM users")
        users = cursor.fetchone()["n"]

        cursor.execute("SELECT COUNT(*) AS n FROM households WHERE is_deleted = 0")
        households = cursor.fetchone()["n"]

        cursor.execute("SELECT COUNT(*) AS n FROM expenses")
        expenses = cursor.fetchone()["n"]

        cursor.execute("SELECT COUNT(*) AS n FROM incomes")
        incomes = cursor.fetchone()["n"]

        cursor.execute("SELECT COUNT(*) AS n FROM budgets")
        budgets = cursor.fetchone()["n"]

        cursor.execute("SELECT COUNT(*) AS n FROM categories")
        categories = cursor.fetchone()["n"]

    return {
        "total_users": users,
        "total_households": households,
        "total_expenses": expenses,
        "total_incomes": incomes,
        "total_budgets": budgets,
        "total_categories": categories,
    }


def get_admin_user(connection=None) -> dict | None:
    """Return the first admin user (role_id=1) for acting_user_id purposes."""
    with _db_cursor(connection=connection) as (cursor, _):
        cursor.execute(
            "SELECT id, email, name, role_id FROM users WHERE role_id = 1 LIMIT 1"
        )
        return cursor.fetchone()


# ───────────────────────── Users ─────────────────────────
def list_users(
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = None,
    connection=None,
) -> dict:
    """Paginated user list with optional name/email search."""
    page = max(1, int(page))
    page_size = min(200, max(1, int(page_size)))
    offset = (page - 1) * page_size

    search = search.strip() if search else None
    params = []
    where = ""
    if search:
        where = "WHERE u.name LIKE %s OR u.email LIKE %s"
        like = f"%{search}%"
        params = [like, like]

    with _db_cursor(connection=connection) as (cursor, _):
        # Total count
        cursor.execute(f"SELECT COUNT(*) AS n FROM users u {where}", params)
        total = cursor.fetchone()["n"]

        # Paginated results
        cursor.execute(
            f"""
            SELECT u.id, u.email, u.name, u.full_name, u.role_id, u.household_id,
                   u.status, u.created_at
            FROM users u {where}
            ORDER BY u.id ASC
            LIMIT %s OFFSET %s
            """,
            params + [page_size, offset],
        )
        rows = cursor.fetchall()

    return {
        "users": rows,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size,
    }


def set_user_role(user_id: int, role_id: int, connection=None) -> bool:
    """Change a user's global role_id (1=admin, 3=member). Returns True if updated."""
    if role_id not in (1, 3):
        raise ValueError("role_id must be 1 (admin) or 3 (member)")
    with _db_cursor(connection=connection) as (cursor, conn):
        cursor.execute("UPDATE users SET role_id = %s WHERE id = %s", (role_id, user_id))
        conn.commit()
        return cursor.rowcount > 0


def delete_user(user_id: int, acting_user_id: int, connection=None) -> None:
    """Permanently delete a user (admin only). Blocks self-delete and last-admin removal."""
    if user_id == acting_user_id:
        raise ValueError("cannot delete your own account")

    conn = connection if connection is not None else get_connection()
    own = connection is None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT role_id FROM users WHERE id = %s", (user_id,))
        row = cursor.fetchone()
        if not row:
            raise ValueError("user not found")

        if row["role_id"] == 1:
            cursor.execute("SELECT COUNT(*) AS n FROM users WHERE role_id = 1")
            admins = cursor.fetchone()["n"]
            if admins <= 1:
                raise ValueError("cannot remove the last admin")

        cursor.close()
        # Use a new cursor for the transaction
        cursor = conn.cursor()
        if not conn.in_transaction:
            conn.start_transaction()

        # Null out FKs that may have RESTRICT
        cursor.execute("UPDATE expenses SET user_id = NULL WHERE user_id = %s", (user_id,))
        cursor.execute("UPDATE incomes SET user_id = NULL WHERE user_id = %s", (user_id,))
        cursor.execute("DELETE FROM household_members WHERE user_id = %s", (user_id,))
        cursor.execute("UPDATE users SET household_id = NULL WHERE id = %s", (user_id,))
        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))

        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        if own and conn.is_connected():
            conn.close()


def create_user(
    email: str,
    name: Optional[str] = None,
    password: Optional[str] = None,
    role_id: int = 3,
    household_id: Optional[int] = None,
    connection=None,
) -> dict:
    """Create a new user. If no password provided, generates a random one.
    Returns the created user dict with plain password if generated."""
    import secrets
    import bcrypt

    if role_id not in (1, 3):
        raise ValueError("role_id must be 1 (admin) or 3 (member)")

    # Check email uniqueness
    with _db_cursor(connection=connection) as (cursor, _):
        cursor.execute("SELECT 1 FROM users WHERE email = %s", (email,))
        if cursor.fetchone():
            raise ValueError("email already exists")

    # Generate password if not provided
    if password is None:
        password = secrets.token_urlsafe(12)

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    display_id = "U" + secrets.token_hex(4).upper()

    with _db_cursor(connection=connection) as (cursor, conn):
        cursor.execute(
            """
            INSERT INTO users (display_id, email, name, password_hash, role_id, status, household_id)
            VALUES (%s, %s, %s, %s, %s, 1, %s)
            """,
            (display_id, email, name, password_hash, role_id, household_id),
        )
        conn.commit()
        user_id = cursor.lastrowid

    return {
        "id": user_id,
        "display_id": display_id,
        "email": email,
        "name": name,
        "role_id": role_id,
        "household_id": household_id,
        "status": 1,
        "password": password,  # Return plain password only when generated
    }


# ───────────────────────── Households ─────────────────────────
def list_households(
    page: int = 1,
    page_size: int = 50,
    include_deleted: bool = False,
    connection=None,
) -> dict:
    """Paginated household list."""
    page = max(1, int(page))
    page_size = min(200, max(1, int(page_size)))
    offset = (page - 1) * page_size

    where = "" if include_deleted else "WHERE is_deleted = 0"
    with _db_cursor(connection=connection) as (cursor, _):
        cursor.execute(f"SELECT COUNT(*) AS n FROM households {where}")
        total = cursor.fetchone()["n"]

        cursor.execute(
            f"""
            SELECT id, name, description, created_at, is_deleted
            FROM households {where}
            ORDER BY id DESC
            LIMIT %s OFFSET %s
            """,
            (page_size, offset),
        )
        rows = cursor.fetchall()

    return {
        "households": rows,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size,
    }


def soft_delete_household(household_id: int, connection=None) -> bool:
    """Soft-delete a household (is_deleted = 1). Returns True if updated."""
    with _db_cursor(connection=connection) as (cursor, conn):
        cursor.execute(
            "UPDATE households SET is_deleted = 1 WHERE id = %s", (household_id,)
        )
        conn.commit()
        return cursor.rowcount > 0


def get_household_members(household_id: int, connection=None) -> list[dict]:
    """List members of a household with their roles."""
    with _db_cursor(connection=connection) as (cursor, _):
        cursor.execute(
            """
            SELECT hm.user_id, u.email, u.name, hm.role, hm.joined_at
            FROM household_members hm
            JOIN users u ON u.id = hm.user_id
            WHERE hm.household_id = %s
            ORDER BY hm.role DESC, u.id
            """,
            (household_id,),
        )
        return cursor.fetchall()


# ───────────────────────── Expenses (global) ─────────────────────────
def list_expenses(
    page: int = 1,
    page_size: int = 50,
    household_id: Optional[int] = None,
    connection=None,
) -> dict:
    """Paginated expenses across all households (optionally filtered)."""
    page = max(1, int(page))
    page_size = min(200, max(1, int(page_size)))
    offset = (page - 1) * page_size

    where = "WHERE e.household_id = %s" if household_id else ""
    params = [household_id] if household_id else []

    with _db_cursor(connection=connection) as (cursor, _):
        cursor.execute(f"SELECT COUNT(*) AS n FROM expenses e {where}", params)
        total = cursor.fetchone()["n"]

        cursor.execute(
            f"""
            SELECT e.id, e.household_id, e.category_id, e.amount, e.description,
                   e.expense_date, e.user_id, c.name AS category_name
            FROM expenses e
            LEFT JOIN categories c ON c.id = e.category_id
            {where}
            ORDER BY e.expense_date DESC, e.id DESC
            LIMIT %s OFFSET %s
            """,
            params + [page_size, offset],
        )
        rows = cursor.fetchall()

    return {
        "expenses": rows,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size,
    }


# ───────────────────────── Budgets (global) ─────────────────────────
def list_budgets(
    page: int = 1,
    page_size: int = 50,
    household_id: Optional[int] = None,
    connection=None,
) -> dict:
    """Paginated budgets across all households (optionally filtered)."""
    page = max(1, int(page))
    page_size = min(200, max(1, int(page_size)))
    offset = (page - 1) * page_size

    where = "WHERE b.household_id = %s" if household_id else ""
    params = [household_id] if household_id else []

    with _db_cursor(connection=connection) as (cursor, _):
        cursor.execute(
            f"SELECT COUNT(*) AS n FROM budgets b {where}", params
        )
        total = cursor.fetchone()["n"]

        cursor.execute(
            f"""
            SELECT b.id, b.household_id, b.category_id, b.year, b.month, b.amount,
                   c.name AS category_name
            FROM budgets b
            LEFT JOIN categories c ON c.id = b.category_id
            {where}
            ORDER BY b.year DESC, b.month DESC, b.id DESC
            LIMIT %s OFFSET %s
            """,
            params + [page_size, offset],
        )
        rows = cursor.fetchall()

    return {
        "budgets": rows,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size,
    }


# ───────────────────────── Categories (global) ─────────────────────────
def list_categories(
    page: int = 1,
    page_size: int = 50,
    household_id: Optional[int] = None,
    connection=None,
) -> dict:
    """Paginated categories across all households (optionally filtered)."""
    page = max(1, int(page))
    page_size = min(200, max(1, int(page_size)))
    offset = (page - 1) * page_size

    where = "WHERE c.household_id = %s" if household_id else ""
    params = [household_id] if household_id else []

    with _db_cursor(connection=connection) as (cursor, _):
        cursor.execute(f"SELECT COUNT(*) AS n FROM categories c {where}", params)
        total = cursor.fetchone()["n"]

        cursor.execute(
            f"""
            SELECT c.id, c.household_id, c.name, c.type
            FROM categories c
            {where}
            ORDER BY c.id DESC
            LIMIT %s OFFSET %s
            """,
            params + [page_size, offset],
        )
        rows = cursor.fetchall()

    return {
        "categories": rows,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size,
    }


# ───────────────────────── Incomes (global) ─────────────────────────
def list_incomes(
    page: int = 1,
    page_size: int = 50,
    household_id: Optional[int] = None,
    connection=None,
) -> dict:
    """Paginated incomes across all households (optionally filtered)."""
    page = max(1, int(page))
    page_size = min(200, max(1, int(page_size)))
    offset = (page - 1) * page_size

    where = "WHERE i.household_id = %s" if household_id else ""
    params = [household_id] if household_id else []

    with _db_cursor(connection=connection) as (cursor, _):
        cursor.execute(f"SELECT COUNT(*) AS n FROM incomes i {where}", params)
        total = cursor.fetchone()["n"]

        cursor.execute(
            f"""
            SELECT i.id, i.household_id, i.user_id, i.amount, i.source,
                   i.income_date, i.created_at, u.name AS user_name
            FROM incomes i
            LEFT JOIN users u ON u.id = i.user_id
            {where}
            ORDER BY i.income_date DESC, i.id DESC
            LIMIT %s OFFSET %s
            """,
            params + [page_size, offset],
        )
        rows = cursor.fetchall()

    return {
        "incomes": rows,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size,
    }


# ───────────────────────── System health ─────────────────────────
def get_system_health(connection=None) -> dict:
    """DB pool status, cache stats, uptime."""
    import os
    import time
    from services import cache

    # DB pool info
    from db.connection import _POOL
    pool_active = 0
    pool_idle = 0
    if _POOL is not None:
        try:
            pool_active = _POOL._cnx_queue.qsize() if hasattr(_POOL, "_cnx_queue") else 0
            pool_idle = _POOL.pool_size - pool_active if _POOL.pool_size else 0
        except Exception:
            pass

    cache_stats = cache.get_admin_stats()

    return {
        "status": "ok",
        "uptime_seconds": int(time.time() - _PROCESS_START),
        "database": {
            "pool_size": os.getenv("DB_POOL_SIZE", "10"),
            "active_connections": pool_active,
            "idle_connections": pool_idle,
        },
        "cache": cache_stats,
        "rate_limit_per_minute": int(os.getenv("RATE_LIMIT_PER_MINUTE", "60")),
    }


_PROCESS_START = time.time()


# ───────────────────────── Logs ─────────────────────────
def read_logs(
    level: Optional[str] = None,
    date: Optional[str] = None,
    limit: int = 500,
) -> list[dict]:
    """Read and parse application log files (fastapi.log, ai_service.log)."""
    import os
    import re

    log_files = [
        os.path.join(os.getcwd(), "fastapi.log"),
        os.path.join(os.getcwd(), "ai_service.log"),
    ]
    level_re = re.compile(r"\b(ERROR|WARN|WARNING|INFO|DEBUG|CRITICAL|TRACE|FATAL)\b")
    date_re = re.compile(r"(\d{4}-\d{2}-\d{2})")

    entries: list[dict] = []
    level_filter = level.strip().upper() if level else None
    date_filter = date.strip() if date else None

    for log_file in log_files:
        if not os.path.exists(log_file):
            continue
        try:
            with open(log_file, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.rstrip("\n")
                    if not line:
                        continue
                    level_match = level_re.search(line)
                    date_match = date_re.search(line)
                    if level_filter and (not level_match or level_match.group(1).upper() != level_filter):
                        continue
                    if date_filter and (not date_match or date_match.group(1) != date_filter):
                        continue
                    entries.append({
                        "timestamp": date_match.group(1) if date_match else None,
                        "level": level_match.group(1) if level_match else None,
                        "message": line,
                        "source": os.path.basename(log_file),
                    })
        except Exception:
            pass

    # Newest first, clamp - sort by timestamp if available, else by message
    def sort_key(entry):
        ts = entry.get("timestamp")
        if ts:
            # Parse YYYY-MM-DD for sorting
            return ts
        return entry["message"]

    entries.sort(key=sort_key, reverse=True)
    return entries[: max(1, min(limit, 2000))]