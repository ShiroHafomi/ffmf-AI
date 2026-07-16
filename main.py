"""
FFMS AI Microservice — Ứng dụng chính
Chạy: python -m uvicorn main:app --reload --port 8000
"""

import os

from dotenv import load_dotenv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.predict import router as predict_router

# Tải biến môi trường từ file .env (CORS_ORIGINS) trước khi đọc config
load_dotenv()

# Khởi tạo ứng dụng FastAPI
app = FastAPI(
    title="FFMS AI Microservice",
    description="Dự đoán chi tiêu bằng AI cho hệ thống quản lý tài chính gia đình",
  version="1.0.0",
)

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


@app.get("/")
def root():
    """Kiểm tra service đang hoạt động."""
    return {"status": "ok", "service": "FFMS Test api"}
