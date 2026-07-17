"""
FFMS AI Microservice — Ứng dụng chính
Chạy: python -m uvicorn main:app --reload --port 8000
"""

import os
import logging

from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.predict import router as predict_router
from routes.insights import router as insights_router

# Tải biến môi trường từ file .env (CORS_ORIGINS) trước khi đọc config
load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ffms")


# Khởi tạo ứng dụng FastAPI (phải định nghĩa trước các decorator @app.*)
app = FastAPI(
    title="FFMS AI Microservice",
    description="Dự đoán chi tiêu bằng AI cho hệ thống quản lý tài chính gia đình",
    version="1.0.0",
)


@app.get("/")
def root():
    """Kiểm tra service đang hoạt động."""
    return {"status": "ok", "service": "FFMS Test api"}


# Cấu hình CORS.
# LƯU Ý: không dùng allow_origins=["*"] cùng allow_credentials=True
# (trình duyệt từ chối combo này). Khai báo nguồn cụ thể qua biến môi trường
# CORS_ORIGINS (phân cách dấu phẩy), mặc định localhost:3000 cho dev.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Đăng ký router
app.include_router(predict_router)
app.include_router(insights_router)
