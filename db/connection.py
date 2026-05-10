"""Kết nối MySQL cho hệ thống FFMS."""

import mysql.connector
from mysql.connector import Error

# Cấu hình database
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "Phuoc123!",
    "database": "ffms",
}


def get_connection():
    """Tạo và trả về kết nối MySQL."""
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        if connection.is_connected():
            return connection
    except Error as e:
        raise ConnectionError(f"Không thể kết nối MySQL: {e}")
