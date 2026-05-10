"""
FFMS AI Microservice — Ứng dụng chính
Chạy: python -m uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.predict import router as predict_router

# Khởi tạo ứng dụng FastAPI
app = FastAPI(
    title="FFMS AI Microservice",
    description="Dự đoán chi tiêu bằng AI cho hệ thống quản lý tài chính gia đình",
    version="1.0.0",
)

# Cấu hình CORS cho phép Node.js backend gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
