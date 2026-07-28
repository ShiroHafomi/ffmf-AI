"""OpenAPI response schemas (documentation only).

These Pydantic models mirror the exact JSON shapes returned by the ``/predict``
and ``/insights`` endpoints. They exist **purely to enrich the Swagger / OpenAPI
docs** — they are wired via the route ``responses={200: {"model": ...}}``
parameter, NOT ``response_model=``.

Why not ``response_model``? The FastAPI service is consumed by the Node backend
under fixed response contracts (including a couple of routes that return their
body through ``HTTPException(detail=...)``). ``response_model`` would *filter* the
live output and risk breaking those consumers. Using ``responses=`` documents the
full schema and examples while leaving the actual runtime payload untouched.
"""

from typing import Optional

from pydantic import BaseModel, Field


# ───────────────────────── Shared building blocks ─────────────────────────
class CategoryInfo(BaseModel):
    """A single spending category with its budget usage."""

    name: str = Field(examples=["Groceries"])
    spent: float = Field(examples=[4200000.0])
    transaction_count: int = Field(examples=[23])
    percent_of_total: float = Field(examples=[34.5])
    budget: Optional[float] = Field(default=None, examples=[3500000.0])
    budget_usage: Optional[float] = Field(default=None, examples=[120.0])
    over_amount: Optional[float] = Field(default=None, examples=[700000.0])


class CategorySuggestion(BaseModel):
    """A structured, frontend-translatable suggestion about a category."""

    type: str = Field(examples=["overspent"])
    category: Optional[str] = Field(default=None, examples=["Groceries"])
    spent: Optional[float] = Field(default=None, examples=[4200000.0])
    budget: Optional[float] = Field(default=None, examples=[3500000.0])
    over_amount: Optional[float] = Field(default=None, examples=[700000.0])
    budget_usage: Optional[float] = Field(default=None, examples=[120.0])
    percent_of_total: Optional[float] = Field(default=None, examples=[34.5])
    total_expense: Optional[float] = Field(default=None)
    total_budget: Optional[float] = Field(default=None)
    usage_percent: Optional[float] = Field(default=None)


class CategoryAnalysis(BaseModel):
    """Per-category breakdown returned inside predict/insights payloads."""

    categories: list[CategoryInfo] = []
    overspent_categories: list[CategoryInfo] = []
    suggestions: list[CategorySuggestion] = []
    total_budget: float = Field(examples=[12000000.0])


class CutbackLever(BaseModel):
    """A concrete cutback opportunity for an overspent category."""

    lever: str = Field(examples=["Groceries"])
    current_spent: float = Field(examples=[4200000.0])
    budget: float = Field(examples=[3500000.0])
    excess: float = Field(examples=[700000.0])
    suggested_cutback: float = Field(examples=[700000.0])
    projected_spent: float = Field(examples=[3500000.0])
    message: str


class CutbackSuggestions(BaseModel):
    levers: list[CutbackLever] = []
    total_potential_saving: float = Field(examples=[700000.0])
    count: int = Field(examples=[1])


class AlertResult(BaseModel):
    lever: str = Field(examples=["Groceries"])
    budget_usage: float = Field(examples=[120.0])
    threshold: float = Field(examples=[80.0])
    spent: float = Field(examples=[4200000.0])
    budget: float = Field(examples=[3500000.0])
    severity: str = Field(examples=["high"])
    message: str


class AlertThresholds(BaseModel):
    default_threshold: float = Field(examples=[80.0])
    per_lever_thresholds: dict[str, float] = Field(
        default_factory=dict, examples=[{"Groceries": 90.0}]
    )
    result: dict = Field(
        examples=[{"alerts": [], "triggered_count": 0, "total_evaluated": 5}]
    )


class Anomaly(BaseModel):
    month: str = Field(examples=["2026-03"])
    amount: float = Field(examples=[18500000.0])
    median: float = Field(examples=[9200000.0])
    deviation_percent: float = Field(examples=[101.1])
    direction: str = Field(examples=["high"])


class Savings(BaseModel):
    surplus: Optional[float] = Field(default=None, examples=[2500000.0])
    status: str = Field(examples=["surplus"])
    tip: str


class RecommendedAction(BaseModel):
    type: str = Field(examples=["budget"])
    priority: str = Field(examples=["high"])
    text: str


class ForecastQuality(BaseModel):
    """Walk-forward backtest metrics for the deterministic forecaster."""

    method: str = Field(examples=["deterministic_walk_forward"])
    folds: int = Field(examples=[9])
    mae: float = Field(examples=[812345.0])
    rmse: float = Field(examples=[905000.0])
    mape_percent: float = Field(examples=[8.4])
    naive_mae: float = Field(examples=[1010000.0])
    skill_vs_naive: Optional[float] = Field(default=None, examples=[0.196])


class CategoryForecast(BaseModel):
    category: str = Field(examples=["Groceries"])
    predicted: float = Field(examples=[3900000.0])
    interval: list[float] = Field(examples=[[3500000.0, 4300000.0]])
    last: float = Field(examples=[4200000.0])
    months: int = Field(examples=[12])
    method: str = Field(examples=["fallback_holt_seasonal"])


# ───────────────────────── /predict response ─────────────────────────
class PredictResponse(BaseModel):
    """Full payload returned by ``GET /predict/{household_id}``."""

    predicted: float = Field(examples=[9800000.0])
    last_month: float = Field(examples=[9200000.0])
    budget: Optional[float] = Field(default=None, examples=[12000000.0])
    increase_percent: float = Field(examples=[6.52])
    status: str = Field(examples=["normal"], description="normal | warning | abnormal")
    message: str = Field(examples=["Your spending is on track. Keep it up!"])
    suggestion: str
    prediction_method: Optional[str] = Field(
        default=None, examples=["fallback_holt_seasonal"]
    )
    prediction_confidence: Optional[str] = Field(default=None, examples=["medium"])
    prediction_interval: Optional[list[float]] = Field(
        default=None, examples=[[9100000.0, 10500000.0]]
    )
    prediction_explanation: Optional[str] = None
    prediction_suggestions: list[str] = []
    category_analysis: CategoryAnalysis
    cutback_suggestions: CutbackSuggestions
    alert_thresholds: AlertThresholds
    predicted_income: Optional[float] = Field(default=None, examples=[13000000.0])
    last_month_income: Optional[float] = Field(default=None, examples=[12500000.0])
    income_increase_percent: Optional[float] = Field(default=None, examples=[4.0])
    income_status: Optional[str] = Field(default=None, examples=["normal"])
    income_message: Optional[str] = None
    income_suggestion: Optional[str] = None


# ───────────────────────── /insights response ─────────────────────────
class ExpensePrediction(BaseModel):
    predicted: float = Field(examples=[9800000.0])
    last_month: float = Field(examples=[9200000.0])
    interval: Optional[list[float]] = Field(
        default=None, examples=[[9100000.0, 10500000.0]]
    )
    increase_percent: float = Field(examples=[6.52])
    status: str = Field(examples=["normal"])
    method: Optional[str] = Field(default=None, examples=["fallback_holt_seasonal"])
    confidence: Optional[str] = Field(default=None, examples=["medium"])
    explanation: Optional[str] = None
    suggestions: list[str] = []


class IncomePrediction(BaseModel):
    predicted: Optional[float] = Field(default=None, examples=[13000000.0])
    last_month: Optional[float] = Field(default=None, examples=[12500000.0])
    interval: Optional[list[float]] = None
    increase_percent: Optional[float] = Field(default=None, examples=[4.0])
    status: Optional[str] = Field(default=None, examples=["normal"])
    method: Optional[str] = None
    confidence: Optional[str] = None
    explanation: Optional[str] = None
    suggestions: list[str] = []


class Predictions(BaseModel):
    expense: ExpensePrediction
    income: Optional[IncomePrediction] = None
    budget: Optional[float] = Field(default=None, examples=[12000000.0])
    category_forecast: list[CategoryForecast] = []
    forecast_quality: Optional[ForecastQuality] = None


class AnalysisSummary(BaseModel):
    message: str
    suggestion: str


class InsightsResponse(BaseModel):
    """Full payload returned by ``GET /insights/{household_id}``."""

    household_id: int = Field(examples=[1])
    predictions: Predictions
    analysis: AnalysisSummary
    category_analysis: CategoryAnalysis
    cutback_suggestions: CutbackSuggestions
    alert_thresholds: AlertThresholds
    anomalies: list[Anomaly] = []
    savings: Savings
    recommended_actions: list[RecommendedAction] = []


# ───────────────────────── /forecast response ─────────────────────────
class SingleMonthForecast(BaseModel):
    """One month's forecast prediction."""

    month_offset: int = Field(examples=[1])
    predicted: float = Field(examples=[9800000.0])
    interval: Optional[list[float]] = Field(
        default=None, examples=[[9100000.0, 10500000.0]]
    )
    increase_percent: float = Field(examples=[6.52])
    status: str = Field(examples=["normal"])
    message: str
    suggestion: str
    method: Optional[str] = Field(default=None)
    confidence: Optional[str] = Field(default=None)
    explanation: Optional[str] = None
    suggestions: list[str] = []


class ForecastResponse(BaseModel):
    """Full payload returned by ``GET /forecast/{household_id}``."""

    household_id: int = Field(examples=[1])
    months_forecast: int = Field(examples=[3])
    forecasts: list[SingleMonthForecast] = []
    forecast_quality: Optional[ForecastQuality] = None
    predicted_income: Optional[float] = Field(default=None)


# ───────────────────────── /anomaly response ─────────────────────────
class AnomalyResponse(BaseModel):
    """Full payload returned by ``GET /anomaly/{household_id}``."""

    household_id: int = Field(examples=[1])
    rel_threshold: float = Field(examples=[1.8])
    anomalies: list[Anomaly] = []
    trend: dict = Field(examples=[{"direction": "increasing", "strength": "moderate", "acceleration": "steady", "slope_pct": 5.0, "recent_slope_pct": 4.5, "confidence": "medium", "r2": 0.85}])
    forecast_quality: Optional[ForecastQuality] = None
    total_months: int = Field(examples=[12])
    anomaly_count: int = Field(examples=[2])


# ───────────────────────── /savings-plan response ─────────────────────────
class MonthProjection(BaseModel):
    """One month's projected expense, income, and savings."""

    month_offset: int = Field(examples=[1])
    predicted_expense: Optional[float] = Field(default=None)
    predicted_income: Optional[float] = Field(default=None)
    surplus: Optional[float] = Field(default=None)
    status: str = Field(examples=["surplus"])
    cumulative_savings: Optional[float] = Field(default=None)


class SavingsPlanResponse(BaseModel):
    """Full payload returned by ``GET /savings-plan/{household_id}``."""

    household_id: int = Field(examples=[1])
    projection_months: int = Field(examples=[6])
    expense_projections: list[MonthProjection] = []
    income_projections: list[MonthProjection] = []
    savings_projections: list[MonthProjection] = []
    budget: Optional[float] = Field(default=None)
    savings_advice: Savings = Field(default_factory=Savings)


# ───────────────────────── /budget-optimizer response ─────────────────────────
class BudgetOptimization(BaseModel):
    """One category's suggested budget allocation."""

    category: str = Field(examples=["Groceries"])
    current_spent: float = Field(examples=[4200000.0])
    current_budget: Optional[float] = Field(default=None, examples=[3500000.0])
    suggested_budget: float = Field(examples=[3800000.0])
    budget_change_pct: Optional[float] = Field(default=None, examples=[8.6])
    rationale: str
    priority: str = Field(examples=["high"])


class BudgetOptimizerResponse(BaseModel):
    """Full payload returned by ``GET /budget-optimizer/{household_id}``."""

    household_id: int = Field(examples=[1])
    total_current_monthly_spend: float = Field(examples=[12000000.0])
    total_suggested_budget: float = Field(examples=[11800000.0])
    total_current_budget: float = Field(examples=[12000000.0])
    optimization: list[BudgetOptimization] = []
    cutback_opportunities: CutbackSuggestions = Field(default_factory=CutbackSuggestions)
    alerts: AlertThresholds = Field(default_factory=AlertThresholds)


class ForecastPoint(BaseModel):
    """A single forecast data point."""

    predicted: Optional[float] = Field(default=None)
    interval: Optional[list[float]] = Field(default=None)
    method: Optional[str] = Field(default=None)
    confidence: Optional[str] = Field(default=None)


# ───────────────────────── /category-insights response ─────────────────────────
class CategoryInsight(BaseModel):
    """Per-category deep insight with trend, forecast, and suggestion."""

    category: str = Field(examples=["Groceries"])
    current_spent: Optional[float] = Field(default=None)
    transaction_count: int = Field(examples=[15])
    trend: dict = Field(default_factory=dict)
    forecast_next_month: ForecastPoint = Field(default_factory=lambda: ForecastPoint(predicted=0.0))
    last_month: Optional[float] = Field(default=None)
    budget: Optional[float] = Field(default=None)
    budget_usage: Optional[float] = Field(default=None)
    over_amount: float = Field(default=0.0)
    suggestion: Optional[str] = None


class CategorySummary(BaseModel):
    """Summary counts across all categories."""

    total_categories: int = Field(examples=[5])
    total_forecast: float = Field(examples=[12000000.0])
    categories_over_budget: int = Field(examples=[2])
    categories_near_limit: int = Field(examples=[1])
    categories_under_budget: int = Field(examples=[2])


class CategoryInsightsResponse(BaseModel):
    """Full payload returned by ``GET /category-insights/{household_id}``."""

    household_id: int = Field(examples=[1])
    categories: list[CategoryInsight] = []
    summary: CategorySummary = Field(default_factory=CategorySummary)


# ───────────────────────── Generic error envelope ─────────────────────────
class ErrorResponse(BaseModel):
    """Standard FastAPI error envelope (``{"detail": "..."}``)."""

    detail: str = Field(examples=["Invalid household_id. Must be a positive integer."])


# ───────────────────────── Excel / File Upload & Export ─────────────────────────
class ExcelUploadResponse(BaseModel):
    """Structured extraction result for expense/budget file uploads."""

    headers: list[str] = Field(default_factory=list)
    normalised_headers: list[str] = Field(default_factory=list)
    data: list[dict] = Field(default_factory=list)
    skipped: list[dict] = Field(default_factory=list)
    total_rows: int = 0
    valid_rows: int = 0
    skipped_count: int = 0


class SheetPreview(BaseModel):
    """Preview of a single sheet: headers and first few sample rows."""

    headers: list[str] = Field(default_factory=list)
    sample_rows_cells: list[list] = Field(default_factory=list)
    total_rows: int = 0


class MultiSheetResponse(BaseModel):
    """General-purpose multi-sheet extraction result."""

    sheets: dict[str, SheetPreview] = Field(default_factory=dict)


class ExportPayload(BaseModel):
    """JSON payload accepted by export endpoints."""

    data: list[dict] = Field(...)
    columns: list[str] | None = Field(default=None)
    sheet_name: str = Field(default="Sheet1")
    filename: str = Field(default="export")
