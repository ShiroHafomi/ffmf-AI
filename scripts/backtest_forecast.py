#!/usr/bin/env python3
"""
Automated backtest job for the forecasting system.

Runs walk-forward backtests across all households with >= 3 months of expenses,
computes MAE, skill vs naive, and prediction interval coverage.
Logs structured metrics (JSONL) to logs/backtest_forecast.jsonl.
Exits non-zero if skill_vs_naive < 0.5 or coverage < 80%.

Usage:
    python scripts/backtest_forecast.py [--days-back N] [--min-households N]
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from db.connection import get_connection
from services.ai_service import (
    backtest_forecast,
    deterministic_forecast,
    residual_based_interval,
    _deterministic_confidence,
    get_model_version,
)
from services.db_service import get_all_household_ids, get_monthly_expenses

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("ffms.backtest")

# Log file path
LOG_DIR = Path(__file__).parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)
BACKTEST_LOG_FILE = LOG_DIR / "backtest_forecast.jsonl"

# Skill and coverage thresholds
MIN_SKILL_VS_NAIVE = 0.5
MIN_COVERAGE_PCT = 80.0
MIN_HOUSEHOLDS_DEFAULT = 1
DEFAULT_DAYS_BACK = 730  # 2 years of history


def log_backtest_metrics(
    household_id: int,
    metrics: dict,
    days_back: int,
    model_version: str,
) -> None:
    """Append JSONL metrics for a single household backtest result."""
    record = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "household_id": household_id,
        "days_back": days_back,
        "model_version": model_version,
        **metrics,
    }
    with open(BACKTEST_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


def run_backtest_for_household(
    household_id: int,
    conn,
    amount_key: str = "total_expense",
    min_train: int = 3,
    days_back: int = DEFAULT_DAYS_BACK,
) -> Optional[dict]:
    """Run backtest for a single household and return metrics or None if insufficient data."""
    # Fetch expense history
    expenses = get_monthly_expenses(household_id, connection=conn)

    if not expenses or len(expenses) < min_train + 1:
        return None

    # Filter by days_back if specified (convert months to approximate days)
    if days_back:
        # Expenses are monthly, so we just use the most recent months
        max_months = max(1, days_back // 30)
        if len(expenses) > max_months:
            expenses = expenses[-max_months:]

    if len(expenses) < min_train + 1:
        return None

    # Run the backtest
    result = backtest_forecast(
        expenses,
        amount_key=amount_key,
        min_train=min_train,
    )

    if result is None:
        return None

    # Add prediction interval coverage check if not present
    # We need to compute coverage from the residual intervals
    # For this we need to re-run with intervals

    return result


def compute_coverage_for_household(
    expenses: list[dict],
    amount_key: str = "total_expense",
    min_train: int = 3,
) -> tuple[float, int]:
    """
    Compute prediction interval coverage using deterministic forecaster + residual intervals.

    Returns (coverage_pct, total_predictions)
    """
    totals = [float(r.get(amount_key, 0)) for r in expenses]
    n_total = len(totals)

    if n_total < min_train + 1:
        return 0.0, 0

    covered = 0
    total = 0

    for i in range(min_train, n_total):
        window = [
            {"yr": 0, "month": j, amount_key: v}
            for j, v in enumerate(totals[:i])
        ]

        # Get deterministic forecast and confidence
        pred, method = deterministic_forecast(window, amount_key)
        confidence = _deterministic_confidence([v for _, v in window])

        # Get prediction interval
        interval = residual_based_interval(window, pred, confidence, amount_key)

        # Check if actual falls within interval
        actual = totals[i]
        if interval[0] <= actual <= interval[1]:
            covered += 1
        total += 1

    coverage_pct = (covered / total * 100) if total > 0 else 0.0
    return coverage_pct, total


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run automated backtest across all households"
    )
    parser.add_argument(
        "--days-back",
        type=int,
        default=DEFAULT_DAYS_BACK,
        help=f"Maximum days of history to consider (default: {DEFAULT_DAYS_BACK})",
    )
    parser.add_argument(
        "--min-households",
        type=int,
        default=MIN_HOUSEHOLDS_DEFAULT,
        help="Minimum number of households required to pass (default: 1)",
    )
    parser.add_argument(
        "--min-train",
        type=int,
        default=3,
        help="Minimum training months required per household (default: 3)",
    )
    parser.add_argument(
        "--log-file",
        type=str,
        default=str(BACKTEST_LOG_FILE),
        help="Path to JSONL log file",
    )
    args = parser.parse_args()

    logger.info(
        "Starting backtest job: days_back=%d, min_households=%d, min_train=%d",
        args.days_back,
        args.min_households,
        args.min_train,
    )

    # Get model version
    model_version = get_model_version()
    logger.info("Model version: %s", model_version)

    # Get database connection
    conn = None
    try:
        conn = get_connection()
    except Exception as e:
        logger.error("Failed to get database connection: %s", e)
        return 1

    # Get all household IDs
    try:
        household_ids = get_all_household_ids(connection=conn)
    except Exception as e:
        logger.error("Failed to fetch household IDs: %s", e)
        if conn:
            conn.close()
        return 1

    if not household_ids:
        logger.warning("No households with expense/income data found")
        return 0

    logger.info("Found %d households with data", len(household_ids))

    # Track aggregate metrics
    all_deterministic_skills = []
    all_ensemble_skills = []
    all_coverages = []
    households_processed = 0
    households_failed = 0

    for hid in household_ids:
        try:
            # Fetch expense history for this household
            expenses = get_monthly_expenses(hid, connection=conn)

            if not expenses or len(expenses) < args.min_train + 1:
                continue

            # Filter by days_back
            if args.days_back:
                max_months = max(1, args.days_back // 30)
                if len(expenses) > max_months:
                    expenses = expenses[-max_months:]

            if len(expenses) < args.min_train + 1:
                continue

            # Run backtest
            result = backtest_forecast(
                expenses,
                amount_key="total_expense",
                min_train=args.min_train,
            )

            if result is None:
                continue

            # Log individual household metrics
            metrics = {
                "folds": result.get("folds", 0),
                "deterministic_mae": result.get("deterministic", {}).get("mae"),
                "deterministic_skill": result.get("deterministic", {}).get("skill_vs_naive"),
                "ensemble_mae": result.get("ensemble", {}).get("mae"),
                "ensemble_skill": result.get("ensemble", {}).get("skill_vs_naive"),
                "winner": result.get("winner"),
            }

            # Compute prediction interval coverage
            coverage_pct, coverage_count = compute_coverage_for_household(
                expenses,
                amount_key="total_expense",
                min_train=args.min_train,
            )

            metrics["coverage_pct"] = round(coverage_pct, 2)
            metrics["coverage_count"] = coverage_count

            log_backtest_metrics(hid, metrics, args.days_back, model_version)

            # Aggregate
            det_skill = result.get("deterministic", {}).get("skill_vs_naive")
            ens_skill = result.get("ensemble", {}).get("skill_vs_naive")

            if det_skill is not None:
                all_deterministic_skills.append(det_skill)
            if ens_skill is not None:
                all_ensemble_skills.append(ens_skill)
            if coverage_count > 0:
                all_coverages.append(coverage_pct)

            households_processed += 1

        except Exception as e:
            logger.warning("Household %d backtest failed: %s", hid, e)
            households_failed += 1
            continue

    if conn:
        conn.close()

    # Summary
    if households_processed == 0:
        logger.error("No households had sufficient data for backtest")
        return 1

    logger.info(
        "Backtest complete: %d processed, %d failed",
        households_processed,
        households_failed,
    )

    # Aggregate results
    det_skill_avg = sum(all_deterministic_skills) / len(all_deterministic_skills) if all_deterministic_skills else None
    ens_skill_avg = sum(all_ensemble_skills) / len(all_ensemble_skills) if all_ensemble_skills else None
    coverage_avg = sum(all_coverages) / len(all_coverages) if all_coverages else None

    logger.info(
        "Aggregate: det_skill=%.3f, ens_skill=%.3f, coverage=%.1f%%",
        det_skill_avg or 0,
        ens_skill_avg or 0,
        coverage_avg or 0,
    )

    # Use the best available skill for pass/fail
    best_skill = max(
        v for v in [det_skill_avg, ens_skill_avg] if v is not None
    ) if (det_skill_avg is not None or ens_skill_avg is not None) else 0

    # Check thresholds
    passed = True
    if best_skill < MIN_SKILL_VS_NAIVE:
        logger.error(
            "FAIL: Best skill_vs_naive (%.3f) < threshold (%.2f)",
            best_skill,
            MIN_SKILL_VS_NAIVE,
        )
        passed = False

    if coverage_avg is not None and coverage_avg < MIN_COVERAGE_PCT:
        logger.error(
            "FAIL: Average coverage (%.1f%%) < threshold (%.1f%%)",
            coverage_avg,
            MIN_COVERAGE_PCT,
        )
        passed = False

    if households_processed < args.min_households:
        logger.error(
            "FAIL: Processed households (%d) < min_households (%d)",
            households_processed,
            args.min_households,
        )
        passed = False

    if passed:
        logger.info("PASS: All thresholds met")
        return 0
    else:
        logger.error("FAIL: One or more thresholds not met")
        return 1


if __name__ == "__main__":
    sys.exit(main())