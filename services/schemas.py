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


# ───────────────────────── Generic error envelope ─────────────────────────
class ErrorResponse(BaseModel):
    """Standard FastAPI error envelope (``{"detail": "..."}``)."""

    detail: str = Field(examples=["Invalid household_id. Must be a positive integer."])
