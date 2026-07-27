"""Next-month expense/income forecasting (deterministic-primary, RAG-augmented).

Pipeline:
  1. RETRIEVE (data): monthly expense/income history + category breakdown (DB).
  2. FORECAST (primary): ensemble of deterministic statistical models —
     Linear Regression (short series, <6 pts), Holt exponential smoothing
     (>=6 pts), Holt-Winters triple smoothing (seasonal, >=24 pts), weighted
     by in-sample time-weighted fit. Seasonal additive adjustment when >=12
     pts. Free, reproducible, no network.
  3. RETRIEVE (knowledge): the most relevant financial-advice snippets for the
     household's situation, via an offline TF-IDF retriever (see
     services/rag_retriever.py). These enrich the returned *suggestions* only.
  4. OPT-IN GENERATE: only if LLM_PROVIDER is explicitly set (anthropic + key,
     or openai-compatible + configured endpoint) does an LLM produce the
     forecast/narrative via structured tool-use. Any failure or missing config
     falls back to step 2 — Claude is NEVER called unless the user opts in.

Analysis helpers (analyze / analyze_categories / detect_anomalies / ...) are
unchanged. New helpers: trend_analysis, residual_based_interval, ensemble_forecast,
holt_winters_forecast.
"""

import logging
import os

import numpy as np
from dotenv import load_dotenv
from sklearn.linear_model import LinearRegression

from services.rag_retriever import (
    RAG_TOP_K,
    build_knowledge_query,
    retrieve_knowledge,
)

logger = logging.getLogger("ffms")

load_dotenv()

# Model Claude dùng CHỈ khi LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY (opt-in
# trả phí). Mặc định service chạy LLM miễn phí local (Ollama) hoặc deterministic.
# Các lựa chọn (mới nhất -> nhẹ nhất):
#   claude-opus-4-8             (mạnh nhất)
#   claude-sonnet-5            (mạnh, nhanh & rẻ hơn)
#   claude-haiku-4-5-20251001  (nhẹ nhất, chi phí thấp)
DEFAULT_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-8")


def _load_rag_config() -> dict:
    """Đọc cấu hình RAG một lần tại import. Tập trung đảm bảo 'không bao giờ
    gọi Claude tính phí trừ khi người dùng CỐ Ý bật', và loại bỏ các lời gọi
    os.getenv rải rác trùng lặp giữa các provider.
    """
    return {
        "provider": os.getenv("LLM_PROVIDER", "deterministic").strip().lower(),
        "openai_base_url": os.getenv(
            "LLM_BASE_URL", "https://api.groq.com/openai/v1"
        ).strip(),
        "openai_model": os.getenv("LLM_MODEL", "llama-3.3-70b-versatile").strip(),
        "openai_api_key": os.getenv("LLM_API_KEY", "").strip(),
        "anthropic_model": os.getenv("ANTHROPIC_MODEL", DEFAULT_MODEL).strip(),
        "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", "").strip(),
        "max_tokens": int(os.getenv("ANTHROPIC_MAX_TOKENS", "1024")),
        "timeout": float(os.getenv("ANTHROPIC_TIMEOUT", "20")),
        "max_retries": int(os.getenv("ANTHROPIC_MAX_RETRIES", "1")),
        # 0 = dự báo xác định (deterministic) hoàn toàn; tăng nhẹ nếu muốn đa dạng.
        "temperature": float(os.getenv("RAG_TEMPERATURE", "0")),
        "top_k": RAG_TOP_K,
    }


_CONFIG = _load_rag_config()

# System prompt ổn định (được cache — xem cache_control trong rag_predict).
_RAG_SYSTEM = (
    "You are a household finance forecasting assistant for the FFMS app.\n"
    "You are given a household's RETRIEVED monthly spending history (oldest to newest) "
    "and, when available, a current-month category breakdown with budgets, plus "
    "RETRIEVED FINANCIAL KNOWLEDGE that you MUST ground your advice in.\n\n"
    "TASK: predict the household's TOTAL spend for the NEXT calendar month as a single "
    "number (no currency symbols).\n\n"
    "HOW TO REASON (in order of importance):\n"
    "1. Recent trend / slope and any acceleration or deceleration in the history.\n"
    "2. Seasonality for the month being forecast (holidays, back-to-school, summer).\n"
    "3. Category spending relative to budget, especially overspent or dominant categories.\n"
    "4. The RETRIEVED FINANCIAL KNOWLEDGE — let it shape concrete, specific tips.\n\n"
    "CONSTRAINTS:\n"
    "- Be financially conservative. Do NOT invent one-off events, bonuses, or emergencies.\n"
    "- The predicted value MUST be non-negative and within a plausible range of the recent "
    "average (roughly 0.5x to 2x). If history is too short or erratic, say so in the "
    "explanation and pick a value near the recent average.\n"
    "- Provide 2-3 sentences of rationale and up to 3 short, actionable suggestions.\n"
    "- Report your confidence as low / medium / high based on history length and stability."
)


# ───────────────────────── Linear regression (fallback) ─────────────────────────
def linear_regression_predict(
    data: list[dict], amount_key: str = "total_expense"
) -> float:
    """Dự đoán bằng Linear Regression (dùng làm fallback tất định)."""
    totals = np.array([float(row[amount_key]) for row in data])
    X = np.arange(len(totals)).reshape(-1, 1)
    y = totals
    model = LinearRegression()
    model.fit(X, y)
    next_idx = len(totals)
    predicted = model.predict(np.array([[next_idx]]))[0]
    return round(float(predicted), 2)


# ─────────────── Holt's double exponential smoothing (trend-aware) ───────────────
def _holt_core(
    totals: list[float],
    h: int = 1,
    alpha: float = 0.6,
    beta: float = 0.3,
    phi: float = 0.98,
) -> dict:
    """Holt's damped double exponential smoothing (trend-aware).

    Returns the h-step forecast plus the in-sample 1-step fitted values, which
    the caller can use for residual / prediction-interval estimation. Damping
    (``phi < 1``) restrains the long-run trend, which is usually more accurate
    than un-damped Holt for real-world spending series that don't grow forever.
    """
    n = len(totals)
    if n < 2:
        base = float(totals[-1]) if totals else 0.0
        return {"pred": base, "fitted": [], "level": base, "trend": 0.0}

    level = float(totals[0])
    trend = float(totals[1] - totals[0])
    fitted: list[float] = []
    for y in totals[1:]:
        fitted.append(level + phi * trend)  # 1-step-ahead forecast of y
        last_level = level
        level = alpha * y + (1 - alpha) * (level + phi * trend)
        trend = beta * (level - last_level) + (1 - beta) * trend
    return {
        "pred": level + h * phi * trend,
        "fitted": fitted,
        "level": level,
        "trend": trend,
    }


def holt_forecast(
    totals: list[float],
    h: int = 1,
    alpha: float = 0.6,
    beta: float = 0.3,
    phi: float = 0.98,
) -> float:
    """Dự báo chuỗi bằng Holt (cấp độ + xu hướng), tốt hơn Linear Regression
    khi chuỗi có xu hướng phi tuyến nhẹ. Mặc định dùng damped trend (phi=0.98)
    để hạn chế overshoot. Trả về giá trị dự báo bước h tới.
    """
    return float(_holt_core(totals, h, alpha, beta, phi)["pred"])


def _apply_seasonality(totals: list[float], months: list[int], base: float) -> float:
    """Điều chỉnh theo mùa nhẹ (additive) theo tháng dương lịch khi có >= 12 điểm.
    Detrend bằng bước trung bình, tính chỉ số theo tháng, cộng chỉ số tháng tới.
    """
    n = len(totals)
    if n < 12 or not months:
        return base

    steps = [totals[i] - totals[i - 1] for i in range(1, n)]
    avg_step = sum(steps) / len(steps) if steps else 0.0
    detr = [totals[i] - i * avg_step for i in range(n)]

    sums: dict[int, float] = {}
    counts: dict[int, float] = {}
    for m, v in zip(months, detr):
        sums[m] = sums.get(m, 0.0) + v
        counts[m] = counts.get(m, 0.0) + 1
    mean_detr = sum(detr) / n
    idx = {m: sums[m] / counts[m] - mean_detr for m in sums}
    if not idx:
        return base

    next_month = (months[-1] % 12) + 1
    return base + idx.get(next_month, 0.0)


def deterministic_forecast(
    data: list[dict], amount_key: str = "total_expense"
) -> tuple[float, str]:
    """Chọn mô hình tất định theo độ dài chuỗi:
      - < 2 điểm : không dự báo được (0.0)
      - 2..5 điểm : Linear Regression (khớp test hồi quy tuyến tính)
      - >= 6 điểm : Holt; >= 12 điểm thêm điều chỉnh theo mùa.
    Trả về (predicted, method).
    """
    totals = [float(row.get(amount_key, 0)) for row in data]
    n = len(totals)
    if n < 2:
        return 0.0, "fallback_none"
    if n < 6:
        return (
            round(float(linear_regression_predict(data, amount_key)), 2),
            "fallback_linear_regression",
        )

    base = holt_forecast(totals)
    method = "fallback_holt"
    if n >= 12:
        months = [int(row.get("month", 0)) for row in data]
        base = _apply_seasonality(totals, months, base)
        method = "fallback_holt_seasonal"
    return round(float(base), 2), method


# ───────────────────────── Retrieval context builder ─────────────────────────
def _season_label(month: int) -> str:
    """Trả nhãn mùa vụ tiếng Anh cho một tháng dương lịch (dùng làm gợi ý
    theo mùa cho model, không rò rỉ dữ liệu)."""
    if month in (11, 12, 1):
        return "year-end / holiday season"
    if month in (8, 9):
        return "back-to-school season"
    if month in (6, 7, 8):
        return "summer"
    if month in (3, 4):
        return "spring"
    if month in (12, 1, 2):
        return "winter"
    return ""


def _build_retrieval_context(
    data: list[dict],
    amount_key: str,
    category_context: list[dict] | None,
    budget: float | None,
    kind: str,
    retrieved_knowledge: list[str] | None = None,
) -> str:
    """Đóng gói lịch sử + ngữ cảnh danh mục + tri thức truy xuất thành văn bản."""
    lines: list[str] = []
    label = "INCOME" if kind == "income" else "EXPENSE"
    lines.append(f"RETRIEVED MONTHLY {label} HISTORY (oldest -> newest):")
    for row in data:
        ym = f"{int(row.get('yr', 0))}-{int(row.get('month', 0)):02d}"
        amt = float(row.get(amount_key, 0))
        lines.append(f"- {ym}: {amt:,.2f}")

    # Tóm tắt nhanh + các tín hiệu suy diễn giúp model định hướng thay vì chỉ
    # liệt kê số thô. Tất cả đều suy từ lịch sử, không rò rỉ thêm dữ liệu.
    amounts = [float(row.get(amount_key, 0)) for row in data]
    if len(amounts) >= 2:
        first, last = amounts[0], amounts[-1]
        prev = amounts[-2]
        avg = sum(amounts) / len(amounts)
        slope = last - first
        slope_pct = (slope / first * 100) if first else 0.0
        mom_pct = ((last - prev) / prev * 100) if prev else 0.0
        direction = "up" if slope > 0 else ("down" if slope < 0 else "flat")
        lines.append(
            "\nSUMMARY: months={n} recent_avg={avg:,.2f} min={mn:,.2f} "
            "max={mx:,.2f} last={last:,.2f} trend={dir} "
            "trend_slope_pct={sp:+.1f} last_mom_change_pct={mom:+.1f}".format(
                n=len(amounts),
                avg=avg,
                mn=min(amounts),
                mx=max(amounts),
                last=last,
                dir=direction,
                sp=slope_pct,
                mom=mom_pct,
            )
        )
        # Gợi ý theo mùa của tháng được dự báo (từ tháng ghi nhận cuối cùng).
        last_month = int(data[-1].get("month", 0))
        next_month = (last_month % 12) + 1
        season = _season_label(next_month)
        if season:
            lines.append(
                f"SEASONALITY: forecasting {season} — expect typical seasonal patterns."
            )

    if budget is not None:
        lines.append(f"\nCURRENT TOTAL BUDGET: {float(budget):,.2f}")

    if category_context:
        lines.append("\nCURRENT-MONTH CATEGORY BREAKDOWN (spent / budget):")
        for c in category_context:
            name = c.get("category_name") or "Other"
            spent = float(c.get("total", 0))
            bud = c.get("budget_amount")
            if bud is not None:
                lines.append(f"- {name}: {spent:,.2f} / {float(bud):,.2f}")
            else:
                lines.append(f"- {name}: {spent:,.2f} (no budget)")

    # Tri thức truy xuất (RAG): các mẩu lời khuyên tài chính liên quan nhất
    # tới tình trạng hộ gia đình, được bộ truy xuất chọn ra. Giúp model đưa ra
    # giải thích/gợi ý cụ thể, có căn cứ thay vì chung chung.
    if retrieved_knowledge:
        lines.append("\nRETRIEVED FINANCIAL KNOWLEDGE (ground your advice in these):")
        for i, snippet in enumerate(retrieved_knowledge, 1):
            snippet = " ".join(str(snippet).split())
            lines.append(f"{i}. {snippet}")

    lines.append("\nCall the report_prediction tool with your prediction.")
    return "\n".join(lines)


# ───────────────────────── Tool spec (structured output) ─────────────────────────
def _rag_tool_spec() -> dict:
    return {
        "name": "report_prediction",
        "description": "Report the predicted next-month total plus a short rationale and tips.",
        "input_schema": {
            "type": "object",
            "properties": {
                "predicted": {
                    "type": "number",
                    "description": "Predicted TOTAL spend for next month, as a plain number (e.g. 1250.50).",
                },
                "explanation": {
                    "type": "string",
                    "description": "2-3 sentence rationale grounded in the provided history.",
                },
                "suggestions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Up to 3 short, actionable tips.",
                },
                "confidence": {
                    "type": "string",
                    "enum": ["low", "medium", "high"],
                    "description": "Your confidence in this prediction.",
                },
            },
            "required": ["predicted", "explanation", "suggestions", "confidence"],
            "additionalProperties": False,
        },
        "strict": True,
    }


# ───────────────────────── Prediction interval ─────────────────────────
def _z_for_confidence(confidence: str) -> float:
    """Wider band when we are *less* confident (few/volatile observations).

    Callers map an honest confidence level to a z-multiplier: low confidence
    (short or choppy history) gets the widest band, high confidence the narrow.
    """
    return {"high": 1.28, "medium": 1.645, "low": 1.96}.get(
        str(confidence).lower(), 1.645
    )


def _prediction_interval(
    totals: list[float], predicted: float, confidence: str
) -> list[float]:
    """Volatility-based 1-step prediction interval ``[lo, hi]``.

    Width is driven by the std-dev of month-over-month changes, so a stable
    series earns a tight band while a volatile one gets a wide one; it is
    widened further when confidence is low or history is short. A small scaled
    floor keeps a perfectly smooth series from reporting a misleading
    zero-width (false-certainty) band. Always non-negative. Gives callers an
    honest uncertainty range instead of a lone point estimate.
    """
    predicted = float(predicted)
    if len(totals) < 2:
        return [round(max(0.0, predicted), 2), round(predicted, 2)]

    diffs = np.diff(np.asarray(totals, dtype=float))
    sd = float(np.std(diffs)) if diffs.size else 0.0
    z = _z_for_confidence(confidence)
    if len(totals) < 6:
        z *= 1.4  # few observations -> extra uncertainty

    half = z * sd
    floor = 0.02 * abs(float(np.mean(totals)))  # scaled minimum band
    half = max(half, floor)

    lo = max(0.0, predicted - half)
    hi = predicted + half
    return [round(lo, 2), round(hi, 2)]


# ───────────────────────── Fallback helper ─────────────────────────
def _first_sentence(text: str) -> str:
    """Rút gọn một mẩu tri thức thành một câu ngắn gọn làm gợi ý."""
    text = " ".join(str(text).split())
    if ". " in text:
        return text.split(". ")[0].rstrip(".") + "."
    return text


def _deterministic_confidence(totals: list[float]) -> str:
    """Honest confidence from history length + stability.

    Short or volatile series cannot support a confident point forecast, so we
    report low; long, stable series earn medium/high. Replaces the old blanket
    "low" so the deterministic path is characterised honestly.
    """
    n = len(totals)
    if n < 6:
        return "low"
    mean = sum(totals) / n
    if mean <= 0:
        return "low"
    cv = float(np.std(totals)) / mean  # coefficient of variation
    if cv > 0.4:
        return "low"
    return "high" if (n >= 12 and cv < 0.25) else "medium"


# ───────────────────────── Holt-Winters (Triple Exponential Smoothing) ─────────
def _holt_winters_core(
    totals: list[float],
    h: int = 1,
    alpha: float = 0.3,
    beta: float = 0.1,
    gamma: float = 0.2,
    seasonal_period: int = 12,
    multiplicative: bool = False,
) -> dict:
    """Holt-Winters triple exponential smoothing with additive seasonality.

    Works when len(totals) >= 2*seasonal_period (2 full cycles). Falls
    back gracefully: if there is not enough data for the seasonal component,
    the seasonal index is treated as zero (effectively Holt smoothing).
    """
    n = len(totals)
    if n < 2:
        base = float(totals[-1]) if totals else 0.0
        return {"pred": base, "fitted": [], "level": base, "trend": 0.0, "seasonal": []}

    sp = min(seasonal_period, n // 2) if n >= 4 else 0

    # Initialize level, trend and seasonal indices.
    if sp >= 2:
        # Initial seasonal indices from the first full cycle.
        first_cycle = totals[:sp]
        cycle_avg = sum(first_cycle) / sp
        initial_seasonal = (
            [v / cycle_avg for v in first_cycle] if cycle_avg != 0 else [1.0] * sp
        )
        # Initial level = average of first cycle / seasonal.
        initial_level = sum(v / s for v, s in zip(first_cycle, initial_seasonal)) / sp
        # Initial trend = average of between-cycle differences.
        if n >= 2 * sp:
            second_cycle = totals[sp : 2 * sp]
            second_avg = sum(second_cycle) / sp
            initial_trend = (second_avg - cycle_avg) / sp
        else:
            initial_trend = 0.0
        seasonal = list(initial_seasonal)
    else:
        initial_level = float(totals[0])
        initial_trend = float(totals[1] - totals[0]) if n >= 2 else 0.0
        seasonal = []
        sp = 0

    level = initial_level
    trend = initial_trend
    fitted: list[float] = []

    # Run the smoothing pass over the data.
    for i, y in enumerate(totals):
        if i == 0:
            last_level = level
            if sp > 0:
                s_idx = i % sp
                sm = seasonal[s_idx]
                level = alpha * (y / sm if multiplicative else y - sm) + (1 - alpha) * (
                    last_level + trend
                )
            else:
                level = alpha * y + (1 - alpha) * (last_level + trend)
            trend = beta * (level - last_level) + (1 - beta) * trend
            if sp > 0:
                s_idx = i % sp
                if multiplicative:
                    seasonal[s_idx] = (
                        gamma * (y / level) + (1 - gamma) * seasonal[s_idx]
                    )
                else:
                    seasonal[s_idx] = (
                        gamma * (y - level) + (1 - gamma) * seasonal[s_idx]
                    )
            fitted.append(level + trend + (seasonal[i % sp] if sp else 0))
            continue

        last_level = level
        if sp > 0:
            s_idx = i % sp
            sm = seasonal[s_idx]
            level = alpha * (y / sm if multiplicative else y - sm) + (1 - alpha) * (
                last_level + trend
            )
        else:
            level = alpha * y + (1 - alpha) * (last_level + trend)
        trend = beta * (level - last_level) + (1 - beta) * trend
        if sp > 0:
            s_idx = i % sp
            if multiplicative:
                seasonal[s_idx] = gamma * (y / level) + (1 - gamma) * seasonal[s_idx]
            else:
                seasonal[s_idx] = gamma * (y - level) + (1 - gamma) * seasonal[s_idx]
        fitted.append(level + trend + (seasonal[i % sp] if sp else 0))

    # h-step forecast.
    if sp > 0:
        seasonal_term = [seasonal[(n + j) % sp] for j in range(h)]
        forecast = (
            level + h * trend + sum(seasonal_term)
            if multiplicative
            else level + h * trend + sum(seasonal_term)
        )
    else:
        forecast = level + h * trend

    return {
        "pred": forecast,
        "fitted": fitted,
        "level": level,
        "trend": trend,
        "seasonal": seasonal,
    }


def holt_winters_forecast(
    totals: list[float],
    h: int = 1,
    alpha: float = 0.3,
    beta: float = 0.1,
    gamma: float = 0.2,
    seasonal_period: int = 12,
) -> float:
    """Holt-Winters additive seasonal forecast. Returns the h-step-ahead
    prediction. Falls back to Holt when there are fewer than
    2*seasonal_period points."""
    result = _holt_winters_core(
        totals,
        h=h,
        alpha=alpha,
        beta=beta,
        gamma=gamma,
        seasonal_period=seasonal_period,
    )
    return round(float(result["pred"]), 2)


# ───────────────────────── Ensemble forecasting ─────────────────────────
def _model_wisdom_score(data: list[dict], amount_key: str, model_name: str) -> float:
    """In-sample wisdom score for a single model on the given data.

    Higher = better fit (lower weighted error). Uses time-weighted
    MSE so recent errors count more — a model that tracks the latest
    months well is preferred over one that looks good historically but
    drifts for recent data.

    Returns a large positive number for perfect fits; the caller picks
    the model with the highest score (= lowest error).
    """
    totals = [float(r.get(amount_key, 0)) for r in data]
    n = len(totals)
    if n < 2:
        return -1e9

    if model_name == "linear_regression":
        X = np.arange(n).reshape(-1, 1)
        y = np.asarray(totals, dtype=float)
        model = LinearRegression()
        model.fit(X, y)
        preds = model.predict(X)
    elif model_name == "holt":
        preds = _holt_core(totals, h=1)["fitted"]
        # Holt fitted values start at index 1; pad with the first value.
        preds = [totals[0]] + preds[: n - 1]
    elif model_name == "holt_winters":
        result = _holt_winters_core(totals, h=1)
        preds = result["fitted"]
        if len(preds) < n:
            preds = preds + [totals[-1]] * (n - len(preds))
        preds = preds[:n]
    else:
        return -1e9

    # Time-weighted MSE (recent months weighted more).
    weights = np.linspace(1.0, 2.0, n)
    errors = np.asarray(preds[:n]) - np.asarray(totals)
    weighted_mse = float(np.average(errors**2, weights=weights))
    # Guard against division by zero and numerical edge cases.
    mean_val = float(np.mean(totals)) if totals else 1.0
    return 1.0 / (1.0 + weighted_mse / (mean_val**2 + 1e-9))


def ensemble_forecast(
    data: list[dict],
    amount_key: str = "total_expense",
) -> tuple[float, str, dict[str, float]]:
    """Multi-model ensemble forecast.

    Trains Linear Regression, Holt, and Holt-Winters on the series.
    Each model gets a wisdom score based on in-sample time-weighted fit.
    The final prediction is a weighted average of each model's forecast,
    where the weights are proportional to their wisdom scores.
    Returns (prediction, method_label, per_model_scores).
    """
    totals = [float(r.get(amount_key, 0)) for r in data]
    n = len(totals)

    # With very little data, fall back to the simplest model.
    if n < 2:
        base = float(totals[-1]) if totals else 0.0
        return round(base, 2), "ensemble_fallback_none", {}

    # Collect candidate predictions with their names and scores.
    candidates: list[tuple[str, float, float]] = []

    # 1) Linear Regression — always available with >= 2 points.
    try:
        lr_pred = linear_regression_predict(data, amount_key)
        lr_score = _model_wisdom_score(data, amount_key, "linear_regression")
        candidates.append(("linear_regression", lr_pred, lr_score))
    except Exception:  # noqa: BLE001
        pass

    # 2) Holt — available with >= 2 points.
    try:
        holt_pred = holt_forecast(totals)
        holt_score = _model_wisdom_score(data, amount_key, "holt")
        candidates.append(("holt", holt_pred, holt_score))
    except Exception:  # noqa: BLE001
        pass

    # 3) Holt-Winters — needs at least 2 full seasonal cycles (24 points
    #    for 12-month seasonality); falls back gracefully otherwise.
    try:
        hw_pred = holt_winters_forecast(totals)
        hw_score = _model_wisdom_score(data, amount_key, "holt_winters")
        candidates.append(("holt_winters", hw_pred, hw_score))
    except Exception:  # noqa: BLE001
        pass

    if not candidates:
        base = float(np.mean(totals)) if totals else 0.0
        return round(base, 2), "ensemble_fallback_none", {}

    # Weight by wisdom score (softmax-like normalisation).
    scores = np.array([c[2] for c in candidates], dtype=float)
    # Shift so the best model has score 1.0 and others are <= 1.0.
    max_score = scores.max()
    if max_score <= 0:
        weights = np.ones(len(scores)) / len(scores)
    else:
        shifted = scores - scores.min() + 1e-9
        weights = shifted / shifted.sum()

    # Weighted average prediction.
    preds = np.array([c[1] for c in candidates], dtype=float)
    ensemble_pred = float(np.average(preds, weights=weights))

    # Label reflects what happened in the ensemble.
    best_name = candidates[int(np.argmax(scores))][0]
    if len(candidates) > 1:
        label = "ensemble"
    else:
        label = f"ensemble_{best_name}"

    per_model = {name: round(float(sc), 4) for name, _, sc in candidates}

    return round(ensemble_pred, 2), label, per_model


# ───────────────────────── Trend-strength detection ─────────────────────────
def trend_analysis(
    data: list[dict],
    amount_key: str = "total_expense",
) -> dict:
    """Detect trend direction, strength, and acceleration/deceleration.

    Returns a dict with:
      - direction: 'increasing' | 'decreasing' | 'flat'
      - strength: 'strong' | 'moderate' | 'weak' (based on R² of the trend)
      - acceleration: 'accelerating' | 'decelerating' | 'steady'
      - slope_pct: slope as percentage of the starting value (positive = up)
      - recent_slope_pct: slope over the last 3 months vs. the full period slope
      - confidence: 'high' | 'medium' | 'low' based on data length and R²
    """
    totals = [float(r.get(amount_key, 0)) for r in data]
    n = len(totals)

    if n < 2:
        return {
            "direction": "flat",
            "strength": "weak",
            "acceleration": "steady",
            "slope_pct": 0.0,
            "recent_slope_pct": 0.0,
            "confidence": "low",
        }

    amounts = np.asarray(totals, dtype=float)
    x = np.arange(n).reshape(-1, 1)

    # Full-period linear regression for trend direction/strength.
    lr = LinearRegression()
    lr.fit(x, amounts)
    r2 = float(lr.score(x, amounts))
    slope = float(lr.coef_[0])
    # Slope as percentage of the mean (normalised direction strength).
    mean_val = float(np.mean(amounts))
    slope_pct = (slope / (mean_val or 1.0)) * 100

    # Direction and strength labels.
    if slope > 0:
        direction = "increasing"
    elif slope < 0:
        direction = "decreasing"
    else:
        direction = "flat"

    # R² thresholds for strength: >=0.7 strong, >=0.4 moderate, else weak.
    if r2 >= 0.7:
        strength = "strong"
    elif r2 >= 0.4:
        strength = "moderate"
    else:
        strength = "weak"

    # Acceleration: compare the last 3-month slope to the full-period slope.
    if n >= 4:
        recent = amounts[-3:]
        x_recent = np.arange(3).reshape(-1, 1)
        lr_recent = LinearRegression()
        lr_recent.fit(x_recent, recent)
        recent_slope = float(lr_recent.coef_[0])
        full_slope_per_3 = slope * 3  # what the full model predicts for 3 months
        if abs(full_slope_per_3) > 1e-9:
            acc_ratio = recent_slope / (abs(full_slope_per_3) / 3)
            if acc_ratio > 1.3:
                acceleration = "accelerating"
            elif acc_ratio < 0.7:
                acceleration = "decelerating"
            else:
                acceleration = "steady"
        else:
            acceleration = "steady"
        recent_slope_pct = (recent_slope / (mean_val or 1.0)) * 100
    else:
        acceleration = "steady"
        recent_slope_pct = slope_pct

    # Confidence based on n and R²: high = many points + strong trend, low = few/noisy.
    if n >= 12 and r2 >= 0.4:
        confidence = "high"
    elif n >= 6 and r2 >= 0.2:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "direction": direction,
        "strength": strength,
        "acceleration": acceleration,
        "slope_pct": round(slope_pct, 2),
        "recent_slope_pct": round(recent_slope_pct, 2),
        "confidence": confidence,
        "r2": round(r2, 3),
    }


# ───────────────────────── Residual-based prediction interval ─────────────────
def residual_based_interval(
    data: list[dict],
    predicted: float,
    confidence: str = "medium",
    amount_key: str = "total_expense",
) -> list[float]:
    """Prediction interval based on the residuals of the best-fit linear trend.

    Uses the standard deviation of the residuals from the trend line,
    scaled by a z-value for the requested confidence level. A scaled
    floor prevents zero-width bands for perfectly consistent series.
    Returns [lo, hi].
    """
    predicted = float(predicted)
    totals = [float(r.get(amount_key, 0)) for r in data]
    n = len(totals)

    if n < 2:
        return [round(max(0.0, predicted), 2), round(predicted, 2)]

    # Fit a linear trend and compute residuals.
    x = np.arange(n).reshape(-1, 1)
    y = np.asarray(totals, dtype=float)
    lr = LinearRegression()
    lr.fit(x, y)
    residuals = y - lr.predict(x)
    sd = float(np.std(residuals))

    # Wider band when we are less confident (few/volatile observations).
    z = _z_for_confidence(confidence)
    if n < 6:
        z *= 1.4

    half = z * sd

    # Scaled minimum band (2% of the mean) so a smooth series
    # does not report a misleading zero-width interval.
    mean_val = float(np.mean(totals))
    floor_half = 0.02 * abs(mean_val) if mean_val else 0.0
    half = max(half, floor_half)

    lo = max(0.0, predicted - half)
    hi = predicted + half
    return [round(lo, 2), round(hi, 2)]


_METHOD_LABELS = {
    "fallback_linear_regression": "linear regression",
    "fallback_holt": "Holt exponential smoothing",
    "fallback_holt_seasonal": "Holt exponential smoothing (seasonal)",
    "fallback_none": "no history",
}


def _deterministic_explanation(method: str, totals: list[float]) -> str:
    """A plain, data-derived explanation for the deterministic forecast."""
    label = _METHOD_LABELS.get(method, "deterministic model")
    if len(totals) >= 2:
        first, last = totals[0], totals[-1]
        direction = (
            "rising" if last > first else ("falling" if last < first else "flat")
        )
        return f"Forecast via {label}; recent trend is {direction} ({first:,.0f} -> {last:,.0f})."
    return f"Forecast via {label}."


def _rag_fallback(
    data: list[dict],
    amount_key: str,
    reason: str = "",
    retrieved_knowledge: list[str] | None = None,
) -> dict:
    """Deterministic forecast — the PRIMARY predictor, not just an error path.

    Uses ensemble forecasting (Linear Regression + Holt + Holt-Winters)
    weighted by in-sample fit for the best point estimate. When retrieval
    succeeded, its snippets become the suggestions. Any failure is
    contained: we still return a valid dict (predicted=0) so the service
    never crashes.
    """
    # Try the ensemble forecaster first; fall back to deterministic on error.
    ensemble_method: str = ""
    per_model: dict = {}
    try:
        pred, ensemble_method, per_model = ensemble_forecast(data, amount_key)
        method = (
            ensemble_method
            if ensemble_method != "ensemble_fallback_none"
            else "fallback_none"
        )
    except Exception as e:  # noqa: BLE001
        logger.error(
            "Ensemble forecast failed; trying deterministic. %s", type(e).__name__
        )
        try:
            pred, method = deterministic_forecast(data, amount_key)
        except Exception:  # noqa: BLE001
            logger.error("Deterministic forecast also failed; returning safe zero.")
            pred, method = 0.0, "fallback_error"

    totals = [float(r.get(amount_key, 0)) for r in data]
    confidence = (
        "low" if method == "fallback_error" else _deterministic_confidence(totals)
    )
    # Use residual-based intervals for better uncertainty quantification.
    interval = residual_based_interval(data, pred, confidence, amount_key)

    # Append per-model scores to explanation when ensemble was used.
    model_details = ""
    if ensemble_method == "ensemble" and per_model:
        model_details = " | Models:" + ", ".join(
            f"{k}={v}" for k, v in sorted(per_model.items(), key=lambda x: -x[1])
        )

    # Even without an LLM, retrieved knowledge enriches the suggestions (RAG
    # works in the free/offline path too). Take up to 3 first sentences.
    suggestions = (
        [_first_sentence(s) for s in retrieved_knowledge][:3]
        if retrieved_knowledge
        else []
    )

    explanation = _deterministic_explanation(method, totals)
    if model_details:
        explanation += model_details
    if reason:
        explanation = f"{explanation} ({reason})"

    return {
        "predicted": pred,
        "interval": interval,
        "explanation": explanation,
        "suggestions": suggestions,
        "confidence": confidence,
        "method": method,
    }


# ───────────────── Tool spec (OpenAI-compatible function calling) ────────────────
def _rag_tool_spec_openai() -> dict:
    """Function-calling tool spec (mirrors Anthropic's) cho endpoint tương thích OpenAI."""
    return {
        "type": "function",
        "function": {
            "name": "report_prediction",
            "description": "Report the predicted next-month total plus a short rationale and tips.",
            "parameters": {
                "type": "object",
                "properties": {
                    "predicted": {
                        "type": "number",
                        "description": "Predicted TOTAL spend for next month, as a plain number (e.g. 1250.50).",
                    },
                    "explanation": {
                        "type": "string",
                        "description": "2-3 sentence rationale grounded in the provided history.",
                    },
                    "suggestions": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Up to 3 short, actionable tips.",
                    },
                    "confidence": {
                        "type": "string",
                        "enum": ["low", "medium", "high"],
                        "description": "Your confidence in this prediction.",
                    },
                },
                "required": ["predicted", "explanation", "suggestions", "confidence"],
                "additionalProperties": False,
            },
        },
    }


def _finalize_rag(inp, data, amount_key, reason) -> dict:
    """Trích predicted từ tool args, kiểm tra hợp lý, trả dict RAG chuẩn."""
    try:
        predicted = float(inp["predicted"])
    except (KeyError, TypeError, ValueError):
        return _rag_fallback(data, amount_key, "Could not parse predicted value.")

    recent = [float(r.get(amount_key, 0)) for r in data]
    avg = sum(recent) / len(recent) if recent else 0
    if not np.isfinite(predicted) or predicted < 0 or predicted > 5 * max(avg, 1):
        return _rag_fallback(data, amount_key, "Predicted value out of sane range.")

    # Guard the structured fields too: a malformed tool call must not leak
    # bad data into the payload (e.g. a non-list suggestions or an unknown
    # confidence level). Fall back to the deterministic model in that case.
    suggestions = inp.get("suggestions", [])
    if not isinstance(suggestions, list):
        return _rag_fallback(data, amount_key, "Malformed suggestions field.")
    confidence = str(inp.get("confidence", "medium")).lower()
    if confidence not in ("low", "medium", "high"):
        confidence = "medium"

    interval = _prediction_interval(recent, predicted, confidence)

    return {
        "predicted": round(predicted, 2),
        "interval": interval,
        "explanation": str(inp.get("explanation", "")),
        "suggestions": [str(s) for s in suggestions[:3]],
        "confidence": confidence,
        "method": "rag",
    }


# ───────────────────────── RAG predict (Claude — trả phí, opt-in) ─────────────────
# Reused across requests to avoid re-authenticating on every call.
_anthropic_client = None


def _get_anthropic_client(api_key: str):
    """Lazy singleton Anthropic client (reused across calls for speed)."""
    global _anthropic_client
    if _anthropic_client is None:
        from anthropic import Anthropic

        _anthropic_client = Anthropic(
            api_key=api_key,
            timeout=_CONFIG["timeout"],
            max_retries=_CONFIG["max_retries"],
        )
    return _anthropic_client


def _rag_predict_anthropic(
    data,
    amount_key,
    category_context,
    budget,
    kind,
    api_key,
    retrieved_knowledge=None,
) -> dict:
    """Gọi Claude (Anthropic). Chỉ chạy khi ANTHROPIC_API_KEY được set."""
    try:
        import anthropic
    except ImportError:
        return _rag_fallback(
            data, amount_key, "anthropic SDK not installed.", retrieved_knowledge
        )

    model = _CONFIG["anthropic_model"]
    context = _build_retrieval_context(
        data, amount_key, category_context, budget, kind, retrieved_knowledge
    )

    try:
        client = _get_anthropic_client(api_key)
        resp = client.messages.create(
            model=model,
            max_tokens=_CONFIG["max_tokens"],
            temperature=_CONFIG["temperature"],
            # No extended-thinking block: forced tool_choice + thinking is
            # fragile across SDK versions, and the model reasons adequately
            # within max_tokens before emitting report_prediction.
            system=[
                {
                    "type": "text",
                    "text": _RAG_SYSTEM,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[_rag_tool_spec()],
            tool_choice={"type": "tool", "name": "report_prediction"},
            messages=[{"role": "user", "content": context}],
        )
    except anthropic.APIError as e:
        logger.warning(
            "Claude API error (%s); falling back to deterministic.", type(e).__name__
        )
        return _rag_fallback(
            data,
            amount_key,
            f"Claude API error: {type(e).__name__}.",
            retrieved_knowledge,
        )
    except Exception as e:  # noqa: BLE001 — bất kỳ lỗi nào cũng fallback
        logger.warning(
            "Claude call failed (%s); falling back to deterministic.", type(e).__name__
        )
        return _rag_fallback(
            data,
            amount_key,
            f"Claude call failed: {type(e).__name__}.",
            retrieved_knowledge,
        )

    # Claude có thể từ chối (refusal) — coi như thất bại, fallback.
    if getattr(resp, "stop_reason", None) == "refusal":
        logger.warning("Claude refused the request; falling back to deterministic.")
        return _rag_fallback(
            data, amount_key, "Model refused the request.", retrieved_knowledge
        )

    tool_use = next(
        (b for b in resp.content if getattr(b, "type", None) == "tool_use"), None
    )
    if not tool_use:
        logger.warning("No tool_use block from Claude; falling back to deterministic.")
        return _rag_fallback(
            data, amount_key, "No tool_use block in response.", retrieved_knowledge
        )
    logger.info("RAG prediction generated via Claude (%s).", model)
    return _finalize_rag(tool_use.input, data, amount_key, "")


# ─────────── RAG predict (LLM miễn phí — OpenAI-compatible: Groq/Together/...) ─────
def _rag_predict_openai_compatible(
    data, amount_key, category_context, budget, kind, retrieved_knowledge=None
) -> dict:
    """Gọi một LLM miễn phí qua endpoint tương thích OpenAI (Groq, Together,
    OpenRouter, Ollama local, ...). Dùng function-calling thay cho tool-use của
    Anthropic. Mọi lỗi đều fallback về deterministic.
    """
    try:
        from openai import OpenAI
    except ImportError:
        return _rag_fallback(
            data, amount_key, "openai SDK not installed.", retrieved_knowledge
        )

    base_url = _CONFIG["openai_base_url"]
    api_key = _CONFIG["openai_api_key"]
    model = _CONFIG["openai_model"]

    # Ollama local không cần key; cloud provider (Groq/Together/...) cần LLM_API_KEY.
    is_local = any(t in base_url for t in ("localhost", "127.0.0.1", ":11434"))
    if not base_url or not model or (not api_key and not is_local):
        return _rag_fallback(
            data,
            amount_key,
            "LLM not configured (using deterministic forecast).",
            retrieved_knowledge,
        )

    context = _build_retrieval_context(
        data, amount_key, category_context, budget, kind, retrieved_knowledge
    )
    try:
        client = OpenAI(
            api_key=api_key or "not-needed",
            base_url=base_url,
            timeout=_CONFIG["timeout"],
            max_retries=_CONFIG["max_retries"],
        )
        resp = client.chat.completions.create(
            model=model,
            max_tokens=_CONFIG["max_tokens"],
            temperature=_CONFIG["temperature"],
            messages=[
                {"role": "system", "content": _RAG_SYSTEM},
                {"role": "user", "content": context},
            ],
            tools=[_rag_tool_spec_openai()],
            tool_choice={"type": "function", "function": {"name": "report_prediction"}},
        )
    except Exception as e:  # noqa: BLE001 — mọi lỗi đều fallback
        logger.warning(
            "LLM call failed (%s); falling back to deterministic.", type(e).__name__
        )
        return _rag_fallback(
            data,
            amount_key,
            f"LLM call failed: {type(e).__name__}.",
            retrieved_knowledge,
        )

    msg = resp.choices[0].message
    if not getattr(msg, "tool_calls", None):
        logger.warning("No tool_calls from LLM; falling back to deterministic.")
        return _rag_fallback(
            data, amount_key, "No tool_calls in response.", retrieved_knowledge
        )
    try:
        import json

        args = json.loads(msg.tool_calls[0].function.arguments or "{}")
    except (ValueError, AttributeError):
        return _rag_fallback(
            data, amount_key, "Could not parse tool arguments.", retrieved_knowledge
        )
    logger.info("RAG prediction generated via OpenAI-compatible LLM (%s).", model)
    return _finalize_rag(args, data, amount_key, "")


# ───────────────────────── RAG predict (orchestrator) ─────────────────────────
def rag_predict(
    data: list[dict],
    amount_key: str = "total_expense",
    category_context: list[dict] | None = None,
    budget: float | None = None,
    kind: str = "expense",
) -> dict:
    """Forecast the next month.

    PRIMARY predictor: a deterministic statistical model (Linear Regression for
    short series, Holt exponential smoothing for longer ones, with a seasonal
    adjustment when >= 12 months are available). It is free, reproducible, and
    needs no network.

    The RAG retrieval step runs OFFLINE on every call and enriches the returned
    *suggestions* with the most relevant financial-advice snippets — but it no
    longer feeds the predicted number.

    LLM generation is STRICTLY OPT-IN and never auto-invoked:
      - LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY  -> Claude (paid, explicit)
      - LLM_PROVIDER=openai-compatible + LLM_BASE_URL + LLM_MODEL (+ key for
        cloud providers)                              -> free cloud LLM
    Any missing configuration or call failure falls back to the deterministic
    forecast above — no paid calls are ever made unexpectedly.
    """
    # Refresh config from env each call so runtime changes (e.g. LLM_PROVIDER)
    # take effect without a module reload.
    global _CONFIG
    _CONFIG = _load_rag_config()

    if not data or len(data) < 2:
        return _rag_fallback(data or [], amount_key, "Not enough history.")

    # RETRIEVE (offline, always): enrich suggestions with relevant advice.
    # A retrieval failure must never break the forecast.
    retrieved: list[str] = []
    try:
        signal = build_knowledge_query(data, amount_key, category_context, budget, kind)
        retrieved = retrieve_knowledge(signal, top_k=_CONFIG["top_k"])
    except Exception:  # noqa: BLE001 — retrieval failure must not break forecasting
        logger.warning("Knowledge retrieval failed; proceeding without it.")
        retrieved = []

    provider = _CONFIG["provider"]

    # Default & recommended: deterministic forecast, retrieval-enriched tips.
    if provider == "deterministic":
        return _rag_fallback(data, amount_key, "", retrieved)

    # Opt-in paid Claude.
    if provider == "anthropic":
        anthropic_key = _CONFIG["anthropic_api_key"]
        if anthropic_key:
            return _rag_predict_anthropic(
                data,
                amount_key,
                category_context,
                budget,
                kind,
                anthropic_key,
                retrieved,
            )
        return _rag_fallback(
            data,
            amount_key,
            "Claude opted-in but ANTHROPIC_API_KEY not set.",
            retrieved,
        )

    # Opt-in free cloud LLM (Groq/Together/OpenRouter/Ollama).
    if provider == "openai-compatible":
        if _CONFIG["openai_base_url"] and _CONFIG["openai_model"]:
            return _rag_predict_openai_compatible(
                data, amount_key, category_context, budget, kind, retrieved
            )
        return _rag_fallback(
            data,
            amount_key,
            "LLM not configured (using deterministic forecast).",
            retrieved,
        )

    # Unknown provider -> deterministic (safe default).
    return _rag_fallback(
        data,
        amount_key,
        f"Unknown LLM_PROVIDER '{provider}'; using deterministic forecast.",
        retrieved,
    )


def predict_next_month(
    data: list[dict],
    amount_key: str = "total_expense",
    category_context: list[dict] | None = None,
    budget: float | None = None,
) -> dict:
    """Dự đoán tháng tiếp theo.

    Primary forecast is deterministic (Linear Regression / Holt). RAG retrieval
    enriches the suggestions. An LLM is used only when explicitly opted in via
    LLM_PROVIDER + credentials; otherwise — or on any failure — the deterministic
    forecast is returned.

    Trả về dict: {predicted, explanation, suggestions, confidence, method}.
    """
    kind = "income" if amount_key == "total_income" else "expense"
    return rag_predict(
        data,
        amount_key=amount_key,
        category_context=category_context,
        budget=budget,
        kind=kind,
    )


def analyze(
    predicted: float,
    last_month: float,
    budget: float | None,
    interval: tuple[float, float] | None = None,
) -> dict:
    """Phân tích kết quả dự đoán so với tháng trước và ngân sách.

    ``interval`` là khoảng dự báo [lo, hi] (do ``_prediction_interval`` tính).
    Nếu cận trên (hi) vượt ngân sách trong khi status vẫn 'normal', tự động
    nâng lên 'warning' — dựa trên biên độ không chắc chắn thay vì chỉ điểm ước.
    """

    if last_month > 0:
        increase_percent = round(((predicted - last_month) / last_month) * 100, 2)
    else:
        increase_percent = 0.0

    status = "normal"
    message = "Your spending is on track. Keep it up!"
    suggestion = "Continue maintaining your current spending habits."

    if budget is not None and predicted > budget:
        status = "warning"
        message = "Next month expense may exceed your budget"
        suggestion = "Reduce unnecessary spending and electricity usage"

    # Ngay cả khi điểm ước chưa vượt, cận trên của khoảng dự báo vượt ngân sách
    # thì vẫn nên cảnh báo (rủi ro vượt). Chỉ nâng từ 'normal' để không ghi đè
    # cảnh báo 'abnormal' (tăng đột biến) ở dưới.
    if (
        status == "normal"
        and budget is not None
        and interval is not None
        and len(interval) == 2
        and interval[1] > budget
    ):
        status = "warning"
        message = "Next month expense may exceed your budget"
        suggestion = "Reduce unnecessary spending and electricity usage"

    if increase_percent > 20:
        status = "abnormal"
        message = "Spending is increasing abnormally compared to last month"
        suggestion = "Review recent large transactions and cut non-essential expenses immediately"

    return {
        "increase_percent": increase_percent,
        "status": status,
        "message": message,
        "suggestion": suggestion,
    }


def analyze_income(predicted: float, last_month: float) -> dict:
    """Phân tích kết quả dự đoán thu nhập so với tháng trước."""
    if last_month > 0:
        increase_percent = round(((predicted - last_month) / last_month) * 100, 2)
    else:
        increase_percent = 0.0

    status = "normal"
    message = "Your income is stable."
    suggestion = "Keep up the good work and consider saving any surplus."

    if increase_percent > 10:
        status = "positive"
        message = "Your income is projected to increase!"
        suggestion = "Great job! Consider investing the extra income."
    elif increase_percent < -10:
        status = "warning"
        message = "Your income is projected to decrease."
        suggestion = "Review your income sources and prepare a tighter budget."

    return {
        "increase_percent": increase_percent,
        "status": status,
        "message": message,
        "suggestion": suggestion,
    }


def analyze_categories(
    category_expenses: list[dict],
    category_budgets: list[dict],
    total_expense: float,
) -> dict:
    """Phân tích chi tiết theo danh mục — trả về structured data cho frontend dịch."""

    budget_map = {}
    for b in category_budgets:
        if b.get("category_name"):
            budget_map[b["category_name"]] = float(b["budget_amount"])

    total_budget = sum(budget_map.values()) if budget_map else 0

    categories = []
    overspent = []
    high_spend = []

    for cat in category_expenses:
        name = cat.get("category_name") or "Other"
        spent = float(cat["total"])
        count = int(cat["transaction_count"])
        budget = budget_map.get(name)

        pct_of_total = (
            round((spent / total_expense * 100), 1) if total_expense > 0 else 0
        )

        cat_info = {
            "name": name,
            "spent": spent,
            "transaction_count": count,
            "percent_of_total": pct_of_total,
            "budget": budget,
        }

        if budget and budget > 0:
            usage = round((spent / budget * 100), 1)
            cat_info["budget_usage"] = usage
            cat_info["over_amount"] = round(spent - budget, 2) if spent > budget else 0

            if spent > budget:
                overspent.append(cat_info)

        if pct_of_total > 30:
            high_spend.append(cat_info)

        categories.append(cat_info)

    overspent.sort(key=lambda x: x.get("over_amount", 0), reverse=True)

    suggestions = []

    for cat in overspent:
        suggestions.append(
            {
                "type": "overspent",
                "category": cat["name"],
                "spent": cat["spent"],
                "budget": cat["budget"],
                "over_amount": cat["over_amount"],
                "budget_usage": cat["budget_usage"],
            }
        )

    for cat in high_spend:
        if cat["name"] not in [s["category"] for s in suggestions]:
            suggestions.append(
                {
                    "type": "high_ratio",
                    "category": cat["name"],
                    "spent": cat["spent"],
                    "percent_of_total": cat["percent_of_total"],
                }
            )

    if total_budget > 0 and total_expense > 0:
        overall_usage = round((total_expense / total_budget * 100), 1)
        suggestions.append(
            {
                "type": "overall",
                "total_expense": total_expense,
                "total_budget": total_budget,
                "usage_percent": overall_usage,
            }
        )

    return {
        "categories": categories,
        "overspent_categories": overspent,
        "suggestions": suggestions,
        "total_budget": total_budget,
    }


def forecast_category_breakdown(
    category_monthly: list[dict],
    amount_key: str = "total",
) -> list[dict]:
    """Dự báo chi tiêu tháng tới theo từng danh mục từ chuỗi tháng của mỗi danh mục.

    ``category_monthly`` : kết quả của ``db_service.get_monthly_category_expenses``
    — mỗi phần tử {category_name, yr, month, total}. Gom theo danh mục, sắp xếp
    theo thời gian, rồi dùng ``ensemble_forecast`` (fallback to deterministic).
    Returns per-category predictions with intervals, trend analysis, and model used.
    """
    from collections import defaultdict

    by_cat: dict[str, list[dict]] = defaultdict(list)
    for r in category_monthly:
        name = r.get("category_name") or "Other"
        by_cat[name].append(
            {
                "yr": int(r.get("yr", 0)),
                "month": int(r.get("month", 0)),
                "total": float(r.get(amount_key, 0)),
            }
        )

    out: list[dict] = []
    for name, series in by_cat.items():
        series.sort(key=lambda x: (x["yr"], x["month"]))
        cat_totals = [s["total"] for s in series]

        if len(series) < 2:
            predicted = round(series[0]["total"], 2) if series else 0.0
            method = "fallback_none" if not series else "single_point"
            conf = "low"
            interval = [predicted, predicted]
        else:
            # Use ensemble forecast for better accuracy on each category.
            try:
                predicted, method, per_model = ensemble_forecast(series, amount_key)
                conf = _deterministic_confidence(cat_totals)
                # Residual-based intervals for the category series.
                interval = residual_based_interval(series, predicted, conf, amount_key)
            except Exception:  # noqa: BLE001
                predicted, method = deterministic_forecast(series, amount_key)
                conf = _deterministic_confidence(cat_totals)
                interval = _prediction_interval(cat_totals, predicted, conf)

        # Trend analysis for this category's history.
        trend = trend_analysis(series, amount_key)

        out.append(
            {
                "category": name,
                "predicted": predicted,
                "interval": interval,
                "last": round(series[-1]["total"], 2),
                "months": len(series),
                "method": method,
                "confidence": conf,
                "trend": trend,
            }
        )

    out.sort(key=lambda x: -x["predicted"])
    return out


def backtest_forecast(
    data: list[dict], amount_key: str = "total_expense", min_train: int = 3
) -> dict | None:
    """Walk-forward 1-step backtest comparing deterministic vs. ensemble forecasters.

    For every month from ``min_train`` onward, fit on all earlier months and
    predict the next, then compare both forecasters against the actual.
    Reports MAE / RMSE / MAPE and a skill score versus a naive
    last-value baseline so callers can judge how much the model actually
    helps (skill > 0 means the model beats "just use last month").
    Returns None when history is too short to backtest. Pure function —
    no DB, no network.
    """
    totals = [float(r.get(amount_key, 0)) for r in data]
    n_total = len(totals)
    if n_total < min_train + 1:
        return None

    det_preds: list[float] = []
    ens_preds: list[float] = []
    acts: list[float] = []
    for i in range(min_train, n_total):
        window = [
            {"yr": 0, "month": j, amount_key: v} for j, v in enumerate(totals[:i])
        ]

        # Deterministic forecaster (original method).
        p_det, _ = deterministic_forecast(window, amount_key)
        det_preds.append(p_det)

        # Ensemble forecaster (multi-model weighted average).
        try:
            p_ens, _, _ = ensemble_forecast(window, amount_key)
        except Exception:  # noqa: BLE001 — never let backtest crash
            p_ens = p_det
        ens_preds.append(p_ens)

        acts.append(totals[i])

    naive = totals[min_train - 1 : -1]  # last value seen before each test month

    def _metrics(preds: list[float], label: str) -> dict:
        errs = [a - p for a, p in zip(acts, preds)]
        nerrs = [a - n for a, n in zip(acts, naive)]
        mae = float(np.mean([abs(e) for e in errs])) if errs else 0.0
        rmse = float(np.sqrt(np.mean([e * e for e in errs]))) if errs else 0.0
        mape = (
            float(np.mean([abs(e / a) * 100 for e, a in zip(errs, acts) if a]))
            if acts
            else 0.0
        )
        nmae = float(np.mean([abs(e) for e in nerrs])) if nerrs else 0.0
        skill = round(1 - mae / nmae, 3) if nmae else None
        return {
            "method": label,
            "folds": len(acts),
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
            "mape_percent": round(mape, 2),
            "naive_mae": round(nmae, 2),
            "skill_vs_naive": skill,
        }

    det_metrics = _metrics(det_preds, "deterministic_walk_forward")
    ens_metrics = _metrics(ens_preds, "ensemble_walk_forward")

    # Pick the winner for the overall verdict.
    winner = (
        "ensemble"
        if ens_metrics["skill_vs_naive"]
        and (
            not det_metrics["skill_vs_naive"] or ens_metrics["mae"] < det_metrics["mae"]
        )
        else "deterministic"
    )

    return {
        "winner": winner,
        "deterministic": det_metrics,
        "ensemble": ens_metrics,
        "folds": len(acts),
    }


def suggest_cutbacks(categories: list[dict]) -> dict:
    """Đề xuất số tiền tiết kiệm được nếu cắt giảm phần vượt ngân sách (excess)
    của từng danh mục (lever).

    Nhận vào danh sách `categories` (kết quả của analyze_categories) — mỗi phần
    tử có ít nhất ``name``, ``spent``, ``budget``. Với mỗi danh mục vượt ngân
    sách, gợi ý cắt giảm đúng phần dư (over_amount) để đưa chi tiêu về ngân sách.
    """

    levers: list[dict] = []
    total_potential_saving = 0.0

    for cat in categories:
        name = cat.get("name") or "Other"
        spent = float(cat.get("spent", 0))
        budget = cat.get("budget")
        if budget is None or budget <= 0:
            continue

        # over_amount ưu tiên lấy từ analyze_categories; tính lại nếu thiếu.
        over = cat.get("over_amount")
        if over is None:
            over = spent - budget
        over = float(over)
        if over <= 0:
            continue

        total_potential_saving += over
        levers.append(
            {
                "lever": name,
                "current_spent": round(spent, 2),
                "budget": round(float(budget), 2),
                "excess": round(over, 2),
                "suggested_cutback": round(over, 2),
                "projected_spent": round(float(budget), 2),
                "message": (
                    f"Cắt giảm {over:,.0f} ở '{name}' để đưa chi tiêu "
                    f"về đúng ngân sách {float(budget):,.0f}."
                ),
            }
        )

    levers.sort(key=lambda s: s["excess"], reverse=True)
    return {
        "levers": levers,
        "total_potential_saving": round(total_potential_saving, 2),
        "count": len(levers),
    }


def evaluate_alert_thresholds(
    categories: list[dict],
    thresholds: dict[str, float],
    default_threshold: float | None = None,
) -> dict:
    """Đánh giá ngưỡng cảnh báo (alert threshold) cho từng lever (danh mục).

    ``thresholds``: dict ánh xạ category_name -> ngưỡng % (ví dụ 80 = 80% ngân
    sách). ``default_threshold``: ngưỡng áp dụng cho các lever không có trong
    ``thresholds``. Kích hoạt cảnh báo khi ``budget_usage >= threshold``.

    Trả về danh sách các lever vượt ngưỡng, sắp xếp theo mức sử dụng giảm dần.
    """

    alerts: list[dict] = []
    evaluated = 0

    for cat in categories:
        name = cat.get("name") or "Other"
        budget = cat.get("budget")
        usage = cat.get("budget_usage")
        if budget is None or budget <= 0:
            continue
        if usage is None:
            spent = float(cat.get("spent", 0))
            usage = (spent / float(budget)) * 100 if budget else 0.0

        evaluated += 1
        thr = thresholds.get(name, default_threshold)
        if thr is None:
            continue

        if usage >= thr:
            severity = "high" if usage >= max(thr, 100) else "warning"
            alerts.append(
                {
                    "lever": name,
                    "budget_usage": round(float(usage), 1),
                    "threshold": thr,
                    "spent": round(float(cat.get("spent", 0)), 2),
                    "budget": round(float(budget), 2),
                    "severity": severity,
                    "message": (
                        f"'{name}' đã dùng {usage:.1f}% ngân sách, "
                        f"vượt ngưỡng cảnh báo {thr}%."
                    ),
                }
            )

    alerts.sort(key=lambda a: a["budget_usage"], reverse=True)
    return {
        "alerts": alerts,
        "triggered_count": len(alerts),
        "total_evaluated": evaluated,
    }


def detect_anomalies(
    data: list[dict], amount_key: str = "total_expense", rel_threshold: float = 1.8
) -> list[dict]:
    """Phát hiện các tháng chi tiêu bất thường."""

    if len(data) < 3:
        return []

    totals = [float(row[amount_key]) for row in data]
    median = float(np.median(totals))
    if median <= 0:
        return []

    anomalies = []
    for row in data:
        amt = float(row[amount_key])
        if amt > median * rel_threshold or amt < median / rel_threshold:
            direction = "high" if amt > median else "low"
            deviation = round((amt - median) / median * 100, 1)
            anomalies.append(
                {
                    "month": f"{int(row['yr'])}-{int(row['month']):02d}",
                    "amount": round(amt, 2),
                    "median": round(median, 2),
                    "deviation_percent": deviation,
                    "direction": direction,
                }
            )

    anomalies.sort(
        key=lambda a: (a["direction"] != "high", -abs(a["deviation_percent"]))
    )
    return anomalies


def generate_savings_advice(
    predicted_expense: float,
    predicted_income: float | None,
    budget: float | None,
) -> dict:
    """Dự phóng tiết kiệm ròng (thu - chi) và đưa ra lời khuyên."""

    if predicted_income is None:
        if budget is not None and predicted_expense > budget:
            return {
                "surplus": None,
                "status": "over_budget",
                "tip": (
                    f"Chi tiêu dự kiến {predicted_expense:,.0f} vượt ngân sách "
                    f"{budget:,.0f}. Hãy cắt giảm chi tiêu không thiết yếu để "
                    "giữ đúng kế hoạch."
                ),
            }
        return {
            "surplus": None,
            "status": "no_budget",
            "tip": "Thiết lập ngân sách hàng tháng để có mục tiêu tiết kiệm cụ thể.",
        }

    surplus = round(predicted_income - predicted_expense, 2)

    if surplus > 0:
        pct = round(surplus / predicted_income * 100, 1)
        status = "surplus"
        tip = (
            f"Dự phóng thặng dư {surplus:,.0f} ({pct}% thu nhập). Hãy tự động "
            "hóa tiết kiệm hoặc đầu tư khoản này thay vì để không."
        )
    elif surplus == 0:
        status = "break_even"
        tip = "Thu nhập và chi tiêu dự kiến hòa vốn. Hãy xây dựng quỹ dự phòng cho các chi phí bất ngờ."
    else:
        deficit = abs(surplus)
        status = "deficit"
        tip = (
            f"Dự phóng thâm hụt {deficit:,.0f}. Xem lại các chi phí cố định hoặc "
            "tìm nguồn thu thêm để không phải dùng đến tiền tiết kiệm."
        )

    return {"surplus": surplus, "status": status, "tip": tip}


def recommend_actions(
    analysis: dict,
    category_analysis: dict,
    anomalies: list[dict],
    savings: dict,
) -> list[dict]:
    """Tổng hợp các hành động được khuyến nghị theo thứ tự ưu tiên."""

    actions: list[dict] = []

    if analysis.get("status") == "abnormal":
        actions.append(
            {
                "type": "spending_spike",
                "priority": "high",
                "text": analysis.get("suggestion", ""),
            }
        )
    if analysis.get("status") == "warning":
        actions.append(
            {
                "type": "budget",
                "priority": "high",
                "text": analysis.get("suggestion", ""),
            }
        )

    for cat in category_analysis.get("overspent_categories", []):
        actions.append(
            {
                "type": "category_overspend",
                "priority": "medium",
                "text": (
                    f"{cat['name']} vượt ngân sách {cat['over_amount']:,.0f} "
                    f"({cat['budget_usage']}% đã dùng)."
                ),
            }
        )

    for a in anomalies:
        if a["direction"] == "high":
            actions.append(
                {
                    "type": "anomaly",
                    "priority": "medium",
                    "text": f"Chi tiêu bất thường cao {a['amount']:,.0f} vào tháng {a['month']} (lệch {a['deviation_percent']}% so với mức điển hình).",
                }
            )
        else:
            actions.append(
                {
                    "type": "anomaly",
                    "priority": "medium",
                    "text": f"Chi tiêu bất thường thấp {a['amount']:,.0f} vào tháng {a['month']} (lệch {a['deviation_percent']}% so với mức điển hình).",
                }
            )

    if savings.get("status") == "deficit":
        actions.append(
            {"type": "savings", "priority": "high", "text": savings.get("tip", "")}
        )
    elif savings.get("status") == "surplus":
        actions.append(
            {"type": "savings", "priority": "low", "text": savings.get("tip", "")}
        )

    order = {"high": 0, "medium": 1, "low": 2}
    actions.sort(key=lambda x: order.get(x["priority"], 3))
    return actions
