#  FFMS AI Microservice

> Household expense **forecasting** & **financial insights** for the FFMS (Family Financial Management System).

[![Python](https://img.shields.io/badge/python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/license-FFMS%20project-blue.svg)](#license)

The FFMS AI Microservice predicts a household's next-month spending and turns its
financial history into actionable insights. It is called **internally** by the Node
backend (which owns auth/UI) and is never exposed directly to browsers.

---

##  Features

-  **Deterministic forecasting** — Linear Regression for short series (2–5 pts),
  Holt exponential smoothing for longer ones (≥6 pts), with an additive **seasonal
  adjustment** when ≥12 months exist. Free, offline, reproducible — this is the
  *primary* predictor.
-  **RAG-enriched suggestions** — an offline TF-IDF retriever (no API key) grounds
  the returned tips in relevant financial knowledge.
-  **Optional LLM** — strictly opt-in via `LLM_PROVIDER` (Claude or any
  OpenAI-compatible endpoint such as Groq/Together/Ollama). Any missing config or
  call failure **falls back** to the deterministic model — no paid calls by surprise.
-  **Insights** — category breakdown, anomaly detection, savings projection,
  cutback levers, per-lever alert thresholds, per-category forecasts, and a
  walk-forward **forecast-quality** backtest.
-  **Secure by design** — `X-API-Key` auth, per-IP rate limiting, explicit-origin
  CORS, and input validation that never echoes raw values.
-  **Interactive dashboard** — a zero-build web UI at `/dashboard`.

---

##  Architecture

```
                         ┌──────────────────────────────┐
   Browser ──▲           │       Node backend            │   owns auth, UI, RBAC
              │ (CORS)   │  (auth authority / JWT)       │
              ▼          └──────────────┬───────────────┘
   Next.js frontend                   │ internal call
              ▲                        ▼  X-API-Key + X-User-Id
              │                        ┌──────────────────────────────┐
              │ (same-origin)          │     FFMS AI Microservice      │
              └──────────────────────  │   (this repo, FastAPI)        │
   /dashboard │                        │                               │
              │          ┌─────────────┴──────────────┐  ┌─────────────┴───────────┐
              │          │ /predict  /insights        │  │ /api/auth /api/expenses │
              │          │ /api/households            │  │ /api/households         │
              │          └─────────────┬──────────────┘  └─────────────┬───────────┘
              │                        │                                │
              │                        ▼                                ▼
              │                 ┌────────────────────────────────────────────┐
              └──────────────── │             MySQL  (db `ffms`)             │
                  static HTML   │   expenses · incomes · budgets · users ·   │
                                │   categories · households · household_members│
                                └────────────────────────────────────────────┘

   Forecast pipeline (per request):
   RETRIEVE history → FORECAST (deterministic: LR / Holt ± seasonal)
                   → RETRIEVE knowledge (offline TF-IDF) → OPT-IN GENERATE (LLM) → analyze
```

---

##  Quick start

```bash
# 1. (optional) create a virtualenv
python -m venv .venv && source .venv/bin/activate

# 2. install dependencies
pip install -r requirements.txt

# 3. configure the environment
cp .env.example .env        # then edit DB_* and secrets
#   leave AI_SERVICE_API_KEY empty for local/dev (auth check disabled)

# 4. run the service
python -m uvicorn main:app --reload --port 8000
```

Then open:

| URL | What |
|-----|------|
| `http://localhost:8000/` | Health check (`{"status":"ok", ...}`) |
| `http://localhost:8000/docs` | **Branded Swagger UI** (interactive) |
| `http://localhost:8000/redoc` | ReDoc API reference |
| `http://localhost:8000/dashboard` | **Web dashboard** (no build step) |

```bash
# Try the API (dev mode: no API key required)
curl http://localhost:8000/predict/1
curl http://localhost:8000/insights/1
```

---

## ⚙️ Environment variables

Copy `.env.example` → `.env`. `.env` is gitignored.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `localhost` / `root` / `""` / `ffms` | MySQL connection |
| `DB_POOL_SIZE` | `10` | Connection-pool size |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins (no `*`, because credentials are used) |
| `AI_SERVICE_API_KEY` | _(empty)_ | If set, **every** request except `/` must carry `X-API-Key`. Empty = check disabled |
| `RATE_LIMIT_PER_MINUTE` | `60` | Per-IP request cap on the public routes |
| `LLM_PROVIDER` | `deterministic` | `deterministic` \| `anthropic` \| `openai-compatible` |
| `RAG_TOP_K` | `4` | Financial-advice snippets injected as suggestions |
| `RAG_TEMPERATURE` | `0` | Sampling temperature for the optional LLM step |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | Groq defaults | Free OpenAI-compatible LLM (opt-in) |
| `ANTHROPIC_MODEL` / `ANTHROPIC_API_KEY` | `claude-opus-4-8` | Paid Claude (opt-in, requires `LLM_PROVIDER=anthropic`) |

---

##  API reference

All routes (except `/`) require `X-API-Key` when `AI_SERVICE_API_KEY` is set, and are
rate-limited per IP.

| Method | Path | Tag | Notes |
|--------|------|-----|-------|
| GET | `/` | Health | Liveness check |
| GET | `/predict/{household_id}` | Predictions | Next-month forecast + budget & category analysis |
| GET | `/insights/{household_id}` | Insights | Full aggregated analysis (forecast, anomalies, savings, actions) |
| POST | `/api/auth/register` | Auth | Provisions a user (mirrors the Node backend; bcrypt cost 10) |
| GET/POST | `/api/expenses`, `/api/expenses/{id}` | Expenses | Expense CRUD (internal) |
| GET/POST/PUT/DELETE | `/api/households/...` | Households | Household & membership management (owner-gated) |

**Common query params** (`/predict`, `/insights`):

- `threshold` — default budget-usage alert threshold, `%` (clamped 0–100, default 80)
- `category_thresholds` — per-lever overrides, e.g. `Food:80,Rent:95`

**Error envelope** — every error returns `{"detail": "..."}` with a generic message
(raw DB/driver values are never leaked).

---

##  Forecasting model

The **primary** predictor is deterministic and always runs (no network, no cost):

| History length | Model | Method label |
|----------------|-------|--------------|
| < 2 points | none (safe zero) | `fallback_none` |
| 2–5 points | Linear Regression | `fallback_linear_regression` |
| 6–11 points | Holt (damped) exponential smoothing | `fallback_holt` |
| ≥ 12 points | Holt + additive seasonal adjustment | `fallback_holt_seasonal` |

- **Confidence** is reported honestly from history length + stability (coefficient of
  variation): `low` → `medium` → `high`.
- **Prediction interval** `[lo, hi]` is volatility-based (std of month-over-month
  changes) and widened for low confidence or short history.
- **RAG retrieval** enriches only the *suggestions* with relevant financial advice.
- **Backtest** (`/insights` → `forecast_quality`) is a walk-forward 1-step evaluation
  reporting MAE / RMSE / MAPE and a *skill score* vs a naive last-value baseline
  (skill > 0 ⇒ the model beats "just use last month").
- An **LLM** is used **only** when `LLM_PROVIDER` is explicitly set and credentials are
  present; any failure falls back to the deterministic forecast.

---

##  Testing

```bash
pip install -r requirements.txt   # includes pytest, pytest-cov via dev extras if any
python -m pytest -q
```

The suite covers the prediction/analysis logic, RAG retrieval, and the auth/expense/
household routes' validation. Forecasting logic is tested with sample expense data;
DB service error handling is covered for `ConnectionError`.

---

##  Security

- **API-key auth** — `api_key_middleware` requires `X-API-Key` (constant-time compare)
  on every request except `/`. Disabled when `AI_SERVICE_API_KEY` is empty (local/dev).
- **Rate limiting** — `slowapi` caps each client IP at `RATE_LIMIT_PER_MINUTE`; over-limit
  ⇒ HTTP 429 with `Retry-After`.
- **CORS** — restricted to explicit `CORS_ORIGINS` (no `"*"`, since credentials are used).
- **Input validation** — `services/validation.py` rejects non-positive `household_id`
  (HTTP 400) and clamps `threshold` to 0–100; error responses never echo raw input.
- **DB credentials** — loaded from environment (`.env`, gitignored); never hardcoded.

---

##  Project layout

```
/backend AI/
├── main.py                 # FastAPI app: API-key middleware, rate limiter, CORS, docs
├── routes/
│   ├── predict.py          # GET  /predict/{household_id}
│   ├── insights.py         # GET  /insights/{household_id}
│   ├── auth.py             # POST /api/auth/register
│   ├── expenses.py         # Expense CRUD
│   ├── households.py       # Household & membership management
│   └── dashboard.py        # GET  /dashboard  (standalone web UI)
├── services/
│   ├── ai_service.py       # Deterministic forecast + RAG/LLM + analysis helpers
│   ├── db_service.py       # MySQL queries (expenses, incomes, budgets, users)
│   ├── household_service.py# Household & membership logic
│   ├── rag_retriever.py    # Offline TF-IDF knowledge retrieval
│   ├── schemas.py          # Pydantic models for OpenAPI docs
│   ├── validation.py       # Shared input validation
│   └── limiter.py          # Shared slowapi rate limiter
├── db/connection.py        # MySQL connection pool (env-based)
├── tests/                  # pytest suite
├── requirements.txt
├── .env.example
└── CLAUDE.md               # Development guidelines
```

---

##  License

Part of the FFMS (Family Financial Management System) family of applications.
