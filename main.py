"""
FFMS AI Microservice — Ứng dụng chính
Chạy: python -m uvicorn main:app --reload --port 8000
"""

import os
import logging

from dotenv import load_dotenv

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from slowapi.errors import RateLimitExceeded

from services.limiter import limiter
from routes.predict import router as predict_router
from routes.insights import router as insights_router
from routes.expenses import router as expenses_router
from routes.auth import router as auth_router
from routes.households import router as households_router

# Tải biến môi trường từ file .env (CORS_ORIGINS, AI_SERVICE_API_KEY, ...) trước.
load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ffms")


# ───────────────────────────── Bảo mật: API key ─────────────────────────────
# Service này chỉ được gọi nội bộ bởi Node backend. Yêu cầu header
# `X-API-Key` khớp với AI_SERVICE_API_KEY. Nếu biến môi trường TRỐNG, tắt
# kiểm tra (chỉ dùng khi chạy local / trong mạng tin cậy).
API_KEY = os.getenv("AI_SERVICE_API_KEY", "").strip()
_API_KEY_REQUIRED = bool(API_KEY)


def _constant_time_compare(a: str, b: str) -> bool:
    """So sánh chuỗi an toàn (không lộ thời gian) để tránh timing attack."""
    a_b = a.encode("utf-8")
    b_b = b.encode("utf-8")
    if len(a_b) != len(b_b):
        return False
    result = 0
    for x, y in zip(a_b, b_b):
        result |= x ^ y
    return result == 0


async def api_key_middleware(request: Request, call_next):
    """Chặn request thiếu/ sai X-API-Key (trừ health-check '/')."""
    if request.url.path == "/":
        return await call_next(request)

    if _API_KEY_REQUIRED:
        provided = request.headers.get("X-API-Key", "")
        if not provided or not _constant_time_compare(provided, API_KEY):
            from slowapi.util import get_remote_address

            logger.warning(
                "Từ chối request thiếu/sai API key từ %s: %s",
                get_remote_address(request),
                request.url.path,
            )
            return JSONResponse(status_code=403, content={"detail": "Forbidden"})

    return await call_next(request)


def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
    from slowapi.util import get_remote_address

    logger.info("Rate limit vượt cho %s", get_remote_address(request))
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please slow down."},
        headers={"Retry-After": "60"},
    )


# Khởi tạo ứng dụng FastAPI (phải định nghĩa trước các decorator @app.*)
app = FastAPI(
    title="FFMS AI Microservice",
    description="Dự đoán chi tiêu bằng AI cho hệ thống quản lý tài chính gia đình",
    version="1.0.0",
)

# Middleware bảo mật. API-key chạy trước rate-limit để không lãng phí quota
# cho request không được xác thực.
app.middleware("http")(api_key_middleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)


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
app.include_router(expenses_router)
app.include_router(auth_router)
app.include_router(households_router)
