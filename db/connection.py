"""Kết nối MySQL cho hệ thống FFMS (có connection pool)."""

import os

from dotenv import load_dotenv

from mysql.connector import Error, pooling

# Tải biến môi trường từ file .env (nếu có)
load_dotenv()

# Cấu hình database — lấy từ biến môi trường (xem .env.example)
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "ffms"),
}

# Kích thước pool (số kết nối được tái sử dụng). Cấu hình qua DB_POOL_SIZE;
# mặc định 10 đủ cho 1 instance FastAPI chạy sync (threadpool).
try:
    _POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
except ValueError:
    _POOL_SIZE = 10
if _POOL_SIZE < 1:
    _POOL_SIZE = 1

_POOL_NAME = "ffms_pool"
_POOL = None


def _get_pool():
    """Lazy-init và trả về MySQL connection pool (thread-safe)."""
    global _POOL
    if _POOL is not None:
        return _POOL
    try:
        _POOL = pooling.MySQLConnectionPool(
            pool_name=_POOL_NAME,
            pool_size=_POOL_SIZE,
            pool_reset_session=True,
            **DB_CONFIG,
        )
    except Error as e:
        raise ConnectionError(f"Không thể khởi tạo pool MySQL: {e}")
    return _POOL


def get_connection():
    """Lấy một kết nối MySQL từ pool (tái sử dụng, không mở mới mỗi lần).

    Trước đây mỗi helper gọi ``mysql.connector.connect()`` riêng → mỗi request
    (và /insights có ~7 query) phải làm handshake + auth TCP mới. Pool giúp
    tái sử dụng kết nối, giảm độ trễ đáng kể. Luôn ``close()`` để trả connection
    về pool (các hàm trong db_service đã làm việc này trong ``finally``).
    """
    try:
        connection = _get_pool().get_connection()
    except Error as e:
        raise ConnectionError(f"Không thể kết nối MySQL: {e}")

    # Kết nối trong pool có thể "hết hạn" (wait_timeout phía server). Thử
    # reconnect trong suốt; nếu vẫn không dùng được thì báo lỗi rõ ràng.
    if not connection.is_connected():
        try:
            connection.ping(reconnect=True)
        except Exception:
            pass

    if not connection.is_connected():
        try:
            connection.close()
        except Exception:
            pass
        raise ConnectionError("Không thể kết nối MySQL: kết nối không khả dụng")

    return connection
