# FFMS AI Microservice

A FastAPI microservice for household expense prediction with AI-powered forecasting and financial analysis.

## Overview

This is a microservice that provides AI-powered expense prediction for household financial management. The system predicts future monthly expenses based on historical spending patterns and provides analysis with budget comparisons.

## Architecture

This is a FastAPI microservice written in Python with the following structure:

```
/backend AI/
├── main.py                    # FastAPI application entry point
├── routes/
│   └── predict.py            # Prediction API endpoints
├── services/
│   ├── ai_service.py         # AI prediction and analysis logic
│   └── db_service.py         # Database service layer
├── db/
│   └── connection.py         # Database connection setup
├── requirements.txt          # Project dependencies
└── CLAUDE.md                 # Development guidelines
```

### Core Features

1. **Expense Prediction**: Uses Linear Regression to forecast next month's expenses
2. **Budget Analysis**: Compares predictions with household budgets
3. **Comprehensive Results**: Provides predicted spending, historical data, and actionable insights
4. **Database Integration**: MySQL backend for storing and retrieving financial data

### API Endpoints

- `GET /predict/{household_id}` - Get predicted expenses and analysis for a household

### Technology Stack

- **Framework**: FastAPI
- **Machine Learning**: scikit-learn (LinearRegression)
- **Database**: MySQL
- **Dependencies**: numpy, mysql-connector-python

## Running the Application

```bash
# Install dependencies
dpip install -r requirements.txt

# Start the development server
python -m uvicorn main:app --reload --port 8000

# Test the API endpoint
curl http://localhost:8000/predict/1
```

## Database Setup

The application requires a MySQL database with:

- **EXPENSES** table: Monthly expense tracking per household
- **BUDGETS** table: Monthly budget limits per household

### Current Database Credentials

Credentials are currently hardcoded in `db/connection.py`. For production use, replace with environment variables:

```python
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", "***********"),  # Replace with actual password
    "database": os.getenv("DB_NAME", "ffms"),
}
```

## Prediction Logic

The AI prediction system:

1. **Analyzes Historical Data**: Uses last 6 months of expense data (or less if available)
2. **Linear Regression Model**: Fits a linear model to the time series data
3. **Compares with Budget**: Checks if predicted expenses exceed the household budget
4. **Provides Insights**: Calculates percentage changes and gives actionable advice

### Key Calculations

- **Increase/Decrease Percentage**: Compares predicted month with previous month
- **Budget Compliance**: Warns if predictions exceed budget limits
- **Anomaly Detection**: Flags abnormal spending patterns (>20% increase)

## Model Architecture

### FastAPI Application Structure

```python
# main.py - FastAPI app setup with CORS configuration
app = FastAPI(title="FFMS AI Microservice", description="Forecasting household expenses")

# Include prediction router
app.include_router(predict_router)
```

### Service Layer Architecture

- **ai_service.py**: Contains `predict_next_month()` and `analyze()` functions
- **LinearRegression**: From scikit-learn for trend analysis
- **Prediction Logic**: Analyzes month-over-month trends
- **Business Rules**: Budget warnings, anomaly detection, user recommendations

### Database Service Layer

- **db_service.py**: Database abstraction layer
- **get_monthly_expenses()**: Fetches historical expense data
- **get_latest_budget()**: Retrieves current household budget
- **Error Handling**: Graceful error handling for database failures

## Testing Considerations

The application currently has no automated tests. When adding tests, consider:

- **Unit Tests**: For prediction logic in ai_service.py
- **Integration Tests**: For database operations
- **API Tests**: For FastAPI endpoints
- **Error Handling**: Test connection failures and edge cases

## Key Considerations

### Security Issues

- **Hardcoded Database Credentials**: Must use environment variables in production
- **CORS Configuration**: Currently allows all origins with credentials
- **Input Validation**: Limited error handling and validation

### Production Enhancements

- **Environment Configuration**: Use .env files or Docker secrets
- **Authentication**: Add JWT authentication for secure API access
- **Error Logging**: Implement comprehensive error logging
- **Performance Optimization**: Add database connection pooling

### Architecture Improvements

- **Caching**: Add Redis caching for frequently accessed data
- **Monitoring**: Add health checks and metrics
- **Testing**: Implement comprehensive test suite

## Future Enhancements

1. **Multi-Horizon Forecasting**: Predict for multiple future months
2. **Advanced ML Models**: Consider XGBoost or neural networks for better accuracy
3. **WebSocket Support**: Real-time updates for dashboard applications
4. **Export Functionality**: CSV/Excel exports for financial reports
5. **User Interface**: Build React/Next.js dashboard for data visualization

## Dependencies

```bash
fastapi
uvicorn
mysql-connector-python
scikit-learn
numpy
```

## License

This project is part of the FFMS (Family Financial Management System) family of applications.

## Contact

For questions or issues, refer to the CLAUDE.md file for development guidelines.