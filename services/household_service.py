"""Quản lý hộ gia đình (households) và thành viên — truy vấn MySQL chung.

Module này chia sẻ cùng DB `ffms` với Node backend. Nó mirror chính xác các
bảng và semantics của Node (`householdService.ts` / `roleService.ts`) để cả hai
service thao tác trên cùng một dữ liệu:

  households(id, name, description, owner_id, is_deleted, created_at)
  household_members(id [auto-inc], household_id, user_id, role, joined_at)
  users(id, email, name, full_name, role_id, household_id, status, ...)

Quy tắc vai trò (household_members.role): 'owner' | 'parent' | 'child'.
Owner được gán tại tạo hộ và cố định (không thể đổi xuống / xoá qua các route).

Lỗi DB (kết nối, SQL) ném ConnectionError — route bắt và trả 500 chung.
Lỗi nghiệp vụ (đã thuộc hộ khác, không tìm thấy, không xoá owner) ném
HouseholdError kèm status code để route dịch sang HTTPException tương ứng.
"""

from db.connection import get_connection

# Vai trò thành viên hợp lệ (có thể gán qua API). 'owner' cố định khi tạo.
VALID_MEMBER_ROLES = ("owner", "parent", "child")
# Vai trò có thể đổi / thêm qua invite & add-member (owner không được phép).
ASSIGNABLE_ROLES = ("parent", "child")


class HouseholdError(Exception):
    """Lỗi nghiệp vụ có status code rõ ràng (không phải lỗi DB).

    Route bắt exception này và dịch sang HTTPException(status_code=status,
    detail=message). Không chứa thông tin nhạy cảm (SQL, host, …).
    """

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


# ───────────────────────── Tạo hộ (transaction) ─────────────────────────
def create_household(name: str, description: str | None, owner_id: int) -> int:
    """Tạo hộ mới + gán owner + liên kết users.household_id trong 1 transaction.

    Trả về id hộ vừa tạo. Gọi tới phải tự kiểm tra user chưa thuộc hộ nào
    (409) trước khi gọi — hàm này không kiểm tra trùng.
    """
    connection = None
    cursor = None
    try:
        connection = get_connection()
        # mysql-connector: autocommit mặc định False -> commit thủ công.
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO households (name, description, owner_id) VALUES (%s, %s, %s)",
            (name, description, owner_id),
        )
        household_id = int(cursor.lastrowid)

        cursor.execute(
            "INSERT INTO household_members (household_id, user_id, role) VALUES (%s, %s, 'owner')",
            (household_id, owner_id),
        )
        cursor.execute(
            "UPDATE users SET household_id = %s WHERE id = %s",
            (household_id, owner_id),
        )
        connection.commit()
        return household_id
    except Exception:
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                pass
        raise
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


# ───────────────────────── Truy vấn hộ / thành viên ─────────────────────────
def get_household(household_id: int) -> dict | None:
    """Lấy thông tin hộ (kèm email owner). Chỉ hộ chưa bị soft-delete."""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT h.id, h.name, h.description, h.owner_id,
                   u.email AS owner_email, h.created_at
            FROM households h
            LEFT JOIN users u ON h.owner_id = u.id
            WHERE h.id = %s AND h.is_deleted = 0
            """,
            (household_id,),
        )
        return cursor.fetchone()
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def get_household_members(household_id: int) -> list[dict]:
    """Danh sách thành viên của hộ, sắp xếp theo joined_at tăng dần."""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT u.id, u.email, u.name, hm.role, hm.joined_at
            FROM household_members hm
            JOIN users u ON hm.user_id = u.id
            WHERE hm.household_id = %s
            ORDER BY hm.joined_at ASC
            """,
            (household_id,),
        )
        return cursor.fetchall()
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def find_households_by_name(name: str) -> list[dict]:
    """Tìm hộ theo tên (khớp một phần, LIKE). Chỉ hộ chưa soft-delete."""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT h.id, h.name, h.description, h.owner_id,
                   u.email AS owner_email, h.created_at
            FROM households h
            LEFT JOIN users u ON h.owner_id = u.id
            WHERE h.is_deleted = 0 AND h.name LIKE %s
            ORDER BY h.id ASC
            """,
            (f"%{name}%",),
        )
        return cursor.fetchall()
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def find_user_by_email(email: str) -> dict | None:
    """Lấy user theo email (id, household_id). Trả None nếu không tồn tại."""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, email, household_id FROM users WHERE email = %s",
            (email,),
        )
        return cursor.fetchone()
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


# ───────────────────────── Thành viên ─────────────────────────
def add_member(household_id: int, user_id: int, role: str) -> int:
    """Thêm user vào hộ với vai trò cho trước. Trả về id của household_members.

    Ném HouseholdError(400) nếu user đã thuộc hộ KHÁC. Không cho phép role
    không hợp lệ (gọi tới phải validate trước).
    """
    if role not in VALID_MEMBER_ROLES:
        raise HouseholdError(f"invalid member role: {role}", status=400)

    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, household_id FROM users WHERE id = %s", (user_id,)
        )
        user = cursor.fetchone()
        if user is None:
            raise HouseholdError("user not found", status=404)
        if user["household_id"] and user["household_id"] != household_id:
            raise HouseholdError(
                "user already belongs to another household", status=400
            )

        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO household_members (household_id, user_id, role) VALUES (%s, %s, %s)",
            (household_id, user_id, role),
        )
        member_id = int(cursor.lastrowid)
        cursor.execute(
            "UPDATE users SET household_id = %s WHERE id = %s",
            (household_id, user_id),
        )
        connection.commit()
        return member_id
    except HouseholdError:
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                pass
        raise
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def set_member_role(household_id: int, user_id: int, role: str) -> bool:
    """Đổi vai trò thành viên. Trả True nếu có dòng bị ảnh hưởng."""
    if role not in VALID_MEMBER_ROLES:
        raise HouseholdError(f"invalid member role: {role}", status=400)

    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            """
            UPDATE household_members SET role = %s
            WHERE household_id = %s AND user_id = %s
            """,
            (role, household_id, user_id),
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def remove_member(household_id: int, user_id: int) -> None:
    """Xoá thành viên khỏi hộ và gỡ users.household_id.

    Ném HouseholdError(400) nếu target là owner; HouseholdError(404) nếu
    không tìm thấy thành viên trong hộ.
    """
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            "SELECT role FROM household_members WHERE household_id = %s AND user_id = %s",
            (household_id, user_id),
        )
        row = cursor.fetchone()
        if row is None:
            raise HouseholdError("member not found in household", status=404)
        if row["role"] == "owner":
            raise HouseholdError("cannot remove the household owner", status=400)

        cursor = connection.cursor()
        cursor.execute(
            "DELETE FROM household_members WHERE household_id = %s AND user_id = %s",
            (household_id, user_id),
        )
        cursor.execute(
            "UPDATE users SET household_id = NULL WHERE id = %s AND household_id = %s",
            (user_id, household_id),
        )
        connection.commit()
    except HouseholdError:
        if connection is not None:
            try:
                connection.rollback()
            except Exception:
                pass
        raise
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


# ───────────────────────── Cập nhật / xoá mềm ─────────────────────────
def update_household(
    household_id: int,
    name: str | None = None,
    description: str | None = None,
) -> bool:
    """Cập nhật các trường được truyền (None = giữ nguyên). Trả True nếu tồn tại."""
    fields: list[str] = []
    params: list = []
    if name is not None:
        fields.append("name = %s")
        params.append(name)
    if description is not None:
        fields.append("description = %s")
        params.append(description)

    if not fields:
        return True  # không có gì để đổi -> coi như thành công (id hợp lệ)

    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            f"UPDATE households SET {', '.join(fields)} WHERE id = %s AND is_deleted = 0",
            params + [household_id],
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()


def soft_delete_household(household_id: int) -> bool:
    """Đánh dấu hộ đã xoá (is_deleted = 1). Trả True nếu có dòng bị ảnh hưởng."""
    connection = None
    cursor = None
    try:
        connection = get_connection()
        cursor = connection.cursor()
        cursor.execute(
            "UPDATE households SET is_deleted = 1 WHERE id = %s AND is_deleted = 0",
            (household_id,),
        )
        connection.commit()
        return cursor.rowcount > 0
    finally:
        if connection is not None and connection.is_connected():
            if cursor is not None:
                cursor.close()
            connection.close()
