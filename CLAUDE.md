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
**SECURITY NOTE**: Database credentials are hardcoded in `db/connection.py`. Replace with environment variables:
```python
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", "***********"),
    "database": os.getenv("DB_NAME", "ffms"),
}
```

### Testing
There are currently no test files in this repository. When adding tests, consider:
- Testing prediction logic with sample expense data
- Testing database service error handling (ConnectionError)
- Testing input validation and error responses

### Project Structure
```
/backend AI/
├── main.py                    # FastAPI application
├── routes/
│   └── predict.py            # API routes
├── services/
│   ├── ai_service.py         # Prediction and analysis logic
│   └── db_service.py         # Database queries
├── db/
│   └── connection.py         # Database connection
├── requirements.txt          # Dependencies
├── .gitignore                # Standard Python ignores
```

## Key Considerations

### Security
- **Database credentials** are hardcoded (should use environment variables)
- **CORS is configured** to allow any origin (`"*"`) with credentials enabled
- No input validation framework (relying on FastAPI's basic validation)

### Architecture Notes
- Simple, monolithic structure with clear separation of concerns
- Linear regression model for trend prediction - consider evaluating for more sophisticated models
- Database abstraction layer is minimal - could benefit from repository pattern
- Error handling is basic (catching ConnectionError, HTTP exceptions)
- No logging infrastructure - add for production debugging

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