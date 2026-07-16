"""Kết nối MySQL cho hệ thống FFMS."""

<<<<<<< HEAD
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
=======
import mysql.connector
from mysql.connector import Error

# Cấu hình database
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "Phuoc123!",
    "database": "ffms",
>>>>>>> 2b0250f1149757761cb81a6118d9931d67d1c983
}


def get_connection():
    """Tạo và trả về kết nối MySQL."""
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        if connection.is_connected():
            return connection
    except Error as e:
        raise ConnectionError(f"Không thể kết nối MySQL: {e}")
