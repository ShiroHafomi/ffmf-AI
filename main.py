"""
FFMS AI Microservice — Ứng dụng chính
Chạy: python -m uvicorn main:app --reload --port 8000
"""

import os
import logging

from dotenv import load_dotenv

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html

from slowapi.errors import RateLimitExceeded

from services.limiter import limiter
from routes.predict import router as predict_router
from routes.insights import router as insights_router
from routes.expenses import router as expenses_router
from routes.auth import router as auth_router
from routes.households import router as households_router
from routes.dashboard import router as dashboard_router

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




# Mô tả (Markdown) hiển thị ở đầu trang /docs.
_API_DESCRIPTION = """
### Household expense forecasting & financial insights

The **FFMS AI Microservice** predicts a household's next-month spending and turns
its financial history into actionable insights.

- 🔮 **Deterministic forecasting** — Linear Regression for short series, Holt
  exponential smoothing (+ seasonal adjustment) for longer ones. Free, offline,
  reproducible.
- 📚 **RAG-enriched suggestions** — an offline TF-IDF retriever grounds the tips.
- 🤖 **Optional LLM** — strictly opt-in via `LLM_PROVIDER` (Claude or any
  OpenAI-compatible endpoint); any failure falls back to the deterministic model.
- 📊 **Insights** — category breakdown, anomaly detection, savings projection,
  cutback levers, alert thresholds, and walk-forward forecast quality.

**Auth:** all routes except `/` require the `X-API-Key` header when
`AI_SERVICE_API_KEY` is configured. **Rate limit:** per-IP, configurable.

👉 Try the interactive **[dashboard](/dashboard)**.
"""

_TAGS_METADATA = [
    {"name": "Health", "description": "Liveness / health check."},
    {"name": "Predictions", "description": "Next-month expense forecast for a household."},
    {"name": "Insights", "description": "Aggregated financial analysis: forecast, categories, anomalies, savings, actions."},
    {"name": "Auth", "description": "Internal user provisioning (mirrors the Node backend)."},
    {"name": "Expenses", "description": "Expense CRUD, called internally by the Node backend."},
    {"name": "Households", "description": "Household & membership management (owner-gated)."},
]

# Khởi tạo ứng dụng FastAPI (phải định nghĩa trước các decorator @app.*).
# docs_url=None: ta tự phục vụ trang Swagger có thương hiệu ở dưới.
app = FastAPI(
    title="FFMS AI Microservice",
    description=_API_DESCRIPTION,
    version="1.0.0",
    contact={"name": "FFMS — Family Financial Management System"},
    license_info={"name": "Part of the FFMS project"},
    openapi_tags=_TAGS_METADATA,
    docs_url=None,
    redoc_url=None,
)

# Middleware bảo mật. API-key chạy trước rate-limit để không lãng phí quota
# cho request không được xác thực.
app.middleware("http")(api_key_middleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Bắt mọi exception không được xử lý và trả về 500 chung (generic).

    Handler mặc định của FastAPI cũng đã trả body chung cho client, nhưng một
    handler app-wide duy nhất đảm bảo (a) exception thật được log phía server kèm
    context request, và (b) không một chi tiết driver/SQL/nội bộ nào rò rỉ ra
    response — khớp quy tắc dự án: error response không bao giờ echo giá trị thô.
    Các HTTPException (kể cả 201/400/...) vẫn do handler riêng xử lý, không bị
    ảnh hưởng.
    """
    logger.error(
        "Unhandled %s on %s %s",
        type(exc).__name__,
        request.method,
        request.url.path,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."},
    )


@app.get("/", tags=["Health"], summary="Health check")
def root():
    """Kiểm tra service đang hoạt động."""
    return {"status": "ok", "service": "FFMS AI Microservice"}


# ───────────────────────── Branded API docs ─────────────────────────
# CSS phủ lên Swagger UI mặc định để trang /docs mang thương hiệu FFMS
# (không đổi nội dung OpenAPI — chỉ trình bày). /openapi.json giữ nguyên.
_SWAGGER_BRAND_CSS = """
<style>
  body { background: #0f1220; }
  .swagger-ui, .swagger-ui .info .title, .swagger-ui .opblock-tag,
  .swagger-ui .opblock .opblock-summary-operation-id,
  .swagger-ui .opblock .opblock-summary-path,
  .swagger-ui .opblock .opblock-summary-description,
  .swagger-ui table thead tr td, .swagger-ui table thead tr th,
  .swagger-ui .parameter__name, .swagger-ui .response-col_status,
  .swagger-ui .model-title, .swagger-ui .model, .swagger-ui label,
  .swagger-ui .tab li, .swagger-ui .info li, .swagger-ui .info p,
  .swagger-ui .info a { color: #e8eaf6 !important; }
  .swagger-ui .scheme-container, .swagger-ui .opblock-tag { background: transparent; box-shadow: none; }
  .topbar { background: linear-gradient(135deg, #6c8cff, #9a6cff) !important; }
  .swagger-ui .info { margin: 24px 0; }
  .swagger-ui .info .title { font-weight: 800; letter-spacing: .3px; }
  .swagger-ui .opblock { border-radius: 12px; border: 1px solid #2c3157; background: #1c2038; margin-bottom: 12px; }
  .swagger-ui .opblock .opblock-summary { border-color: #2c3157; }
  .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #6c8cff; }
  .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #37d39b; }
  .swagger-ui .opblock.opblock-put .opblock-summary-method,
  .swagger-ui .opblock.opblock-patch .opblock-summary-method { background: #ffcc66; }
  .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #ff6b8b; }
  .swagger-ui .btn.authorize { border-color: #6c8cff; color: #6c8cff; }
  .swagger-ui .btn.execute { background: #6c8cff; border-color: #6c8cff; }
  .swagger-ui select, .swagger-ui input[type=text], .swagger-ui textarea {
    background: #171a2e; color: #e8eaf6; border: 1px solid #2c3157; }
  .swagger-ui .highlight-code, .swagger-ui .microlight { background: #10131f !important; }
  .swagger-ui .response-col_description__inner p { color: #9aa0c3 !important; }
</style>
"""


@app.get("/docs", include_in_schema=False)
def custom_swagger_ui() -> HTMLResponse:
    """Trang Swagger UI có thương hiệu FFMS (CSS phủ)."""
    html = get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} · API Docs",
        swagger_favicon_url="https://fastapi.tiangolo.com/img/favicon.png",
    )
    body = html.body.decode("utf-8").replace("</head>", _SWAGGER_BRAND_CSS + "</head>")
    return HTMLResponse(body)


@app.get("/redoc", include_in_schema=False)
def custom_redoc() -> HTMLResponse:
    """Trang ReDoc (tài liệu API dạng đọc)."""
    return get_redoc_html(openapi_url=app.openapi_url, title=f"{app.title} · ReDoc")


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
app.include_router(dashboard_router)
