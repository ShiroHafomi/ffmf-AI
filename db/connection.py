"""Kết nối MySQL cho hệ thống FFMS."""

import os

from dotenv import load_dotenv

import mysql.connector
from mysql.connector import Error

# Tải biến môi trường từ file .env (nếu có)
load_dotenv()

# Cấu hình database — lấy từ biến môi trường (xem .env.example)
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "ffms"),
}


def get_connection():
    """Tạo và trả về kết nối MySQL."""
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
    except Error as e:
        raise ConnectionError(f"Không thể kết nối MySQL: {e}")

    # connect() may succeed but hand back a dead connection; treat that as a
    # failure so callers get a clean ConnectionError (which the routes catch)
    # instead of a confusing AttributeError downstream.
    if not connection.is_connected():
        try:
            connection.close()
        except Exception:
            pass
        raise ConnectionError("Không thể kết nối MySQL: kết nối không khả dụng")

    return connection
