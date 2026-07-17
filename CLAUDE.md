# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Codebase Architecture

This is a FastAPI microservice for household expense prediction written in Python. The architecture consists of:

### Core Components
- **Main Application** (`main.py`): FastAPI app with CORS middleware and root endpoint at `/`
- **API Routes** (`routes/predict.py`): Single `/predict/{household_id}` endpoint that orchestrates the prediction workflow
- **Services Layer**:
  - `services/ai_service.py`: Linear regression prediction using scikit-learn and expense analysis logic
  - `services/db_service.py`: Database queries for monthly expenses and latest budget
- **Database Layer** (`db/connection.py`): MySQL connection management with hardcoded credentials

### Data Flow
1. API receives household_id → validates input
2. Calls `get_monthly_expenses()` → returns last 6 months data
3. Calls `get_latest_budget()` → returns current budget if exists
4. Calls `predict_next_month()` → LinearRegression on historical data
5. Calls `analyze()` → generates status, message, and suggestions
6. Returns comprehensive prediction with analysis

## Common Development Commands

### Installation and Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Start the development server
python -m uvicorn main:app --reload --port 8000

# Test the API endpoint
curl http://localhost:8000/predict/1
```

### Database Configuration
Database credentials are read from environment variables (loaded via `python-dotenv`
from the project-root `.env`, which is gitignored). See `.env.example` for the full
list. `db/connection.py`:
```python
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "ffms"),
}
```
Do NOT reintroduce hardcoded credentials. The root `.env` is the FastAPI service's
live config — never delete it (it is not tracked by git and cannot be recovered).

### Testing
There are currently no test files in this repository. When adding tests, consider:
- Testing prediction logic with sample expense data
- Testing database service error handling (ConnectionError)
- Testing input validation and error responses

### Project Structure
```
/backend AI/
├── main.py                    # FastAPI app: API-key middleware, rate limiter, CORS
├── routes/
│   ├── predict.py            # GET /predict/{household_id}
│   └── insights.py           # GET /insights/{household_id} (aggregated analysis)
├── services/
│   ├── ai_service.py         # RAG prediction (Claude) + deterministic fallback + analysis
│   ├── db_service.py         # Database queries
│   ├── limiter.py            # slowapi rate limiter (shared)
│   └── validation.py         # Shared input validation
├── db/
│   └── connection.py         # Database connection (env-based)
├── tests/
│   └── test_ai_service.py    # pytest suite for prediction/analysis logic
├── requirements.txt          # Dependencies
├── .env.example              # Env var template (copy to .env)
├── .gitignore                # Standard Python ignores
```

## Key Considerations

### Security
- **Database credentials** come from environment variables (`.env`, gitignored) — never hardcoded.
- **CORS** is restricted to explicit origins via `CORS_ORIGINS` (no `"*"`, since `allow_credentials=True`).
- **API-key auth**: `api_key_middleware` in `main.py` requires the `X-API-Key` header to match
  `AI_SERVICE_API_KEY` on every request except the `/` health check. If the env var is empty the
  check is disabled (local/trusted-network dev only). Comparison is constant-time.
- **Rate limiting**: `slowapi` limits each client IP to `RATE_LIMIT_PER_MINUTE` (default 60) requests
  on the `/predict` and `/insights` routes; over-limit returns HTTP 429. Limiter lives in
  `services/limiter.py`; decorated routes must take a `request: Request` param.
- **Input validation**: `services/validation.py` rejects non-positive `household_id` (HTTP 400) and
  clamps `threshold` to 0–100. Error responses use generic messages (no raw value echoing).

### Architecture Notes
- Simple, monolithic structure with clear separation of concerns
- Linear regression model for trend prediction - consider evaluating for more sophisticated models
- Database abstraction layer is minimal - could benefit from repository pattern
- Error handling is basic (catching ConnectionError, HTTP exceptions)
- Logging is configured in `main.py` via `logging.basicConfig` (level from `LOG_LEVEL`, default INFO)

### Technology Stack
- **Framework**: FastAPI
- **ML Library**: scikit-learn (LinearRegression)
- **Database**: MySQL
- **Dependencies**: numpy, mysql-connector-python

## Common Tasks

1. **Modify prediction model**: Update `ai_service.py`'s `predict_next_month()` function
2. **Add new metrics**: Extend the `analyze()` function with additional analysis
3. **Database schema changes**: Modify connection or query logic in `db_service.py`
4. **API enhancements**: Add new routes in `routes/predict.py`
5. **Environment setup**: Configure `.env` file for database credentials

This codebase is well-structured for its current scope but has opportunities for improvement in security, testing, and maintainability.