"""AI Thinking Process Logger — structured JSON trace of every AI decision.

Writes one JSON object per line to a daily log file in ``logs/thinking/``.
Each entry records the step name, category, input summary, reasoning narrative,
and output so callers can trace exactly how the AI arrived at a forecast,
selected a model, or chose a confidence level.

Usage::

    from services.thinking_log import thinking_log

    thinking_log.log(
        step="ensemble_forecast",
        category="model_selection",
        input_summary={"n": 12, "key": "total_expense"},
        reasoning="3 models scored; holt_winters won (time-weighted MSE best)",
        output={"prediction": 1520.50, "method": "ensemble"},
    )

DOs and DON'Ts
  - DO call .log() at every non-trivial decision point.
  - DO keep input_summary / output compact — summarise, don't dump raw DB rows.
  - DON'T put PII (user emails, names, etc.) in any field.
  - DON'T catch errors from .log() — it swallows its own failures internally.
"""

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("ffms")


def _env_bool(key: str, default: bool = True) -> bool:
    """Read boolean env var. Accepts '0'/'false'/'no' as False."""
    val = os.getenv(key, "").strip().lower()
    if not val:
        return default
    return val not in ("0", "false", "no", "off")


class ThinkingLogger:
    """Thread-safe, fail-soft logger for AI decision steps.

    Every ``.log()`` call appends one JSON line to the daily log file.
    If the file or directory cannot be written, the error is logged via
    the standard ``logging`` channel and the call returns silently —
    a thinking-log failure *never* breaks a forecast.
    """

    def __init__(self, enabled: bool = True, log_dir: str = "logs/thinking"):
        self._enabled = enabled
        self._log_dir = Path(log_dir)
        self._lock = threading.Lock()
        self._day: str = ""          # yyyy-mm-dd — cache to avoid stat per log
        self._current_path: Path | None = None

    # ── public API ──────────────────────────────────────────────────

    def is_enabled(self) -> bool:
        """True if thinking logs are written."""
        return self._enabled

    def log(
        self,
        step: str,
        category: str,
        input_summary: dict | None = None,
        output: dict | None = None,
        reasoning: str = "",
    ) -> str | None:
        """Record a single AI decision step.

        Parameters
        ----------
        step:
            Unique name of this decision step, e.g.
            ``"deterministic_forecast"``, ``"ensemble_weighting"``,
            ``"llm_call_anthropic"``, ``"coach_stream_prompt"``.
        category:
            Broad grouping — ``"model_selection"``, ``"prediction"``,
            ``"confidence"``, ``"fallback"``, ``"rag"``,
            ``"llm_call"``, ``"coach"``, ``"trend_analysis"``,
            ``"backtest"``, ``"interval"``.
        input_summary:
            Compact dict describing the input — never more than a few
            keys. e.g. ``{"n": 8, "amount_key": "total_expense"}``.
        output:
            Compact dict describing the result. e.g.
            ``{"predicted": 1520.50, "method": "ensemble"}``.
        reasoning:
            One- or two-sentence plain-language narrative about what
            the model considered and why it chose this path.

        Returns
        -------
        The written file path on success, ``None`` if logging is disabled
        or the write failed. The caller should NOT inspect the return value
        — it exists only for test assertions.
        """
        if not self._enabled:
            return None

        ts = datetime.utcnow()
        entry = {
            "ts": ts.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ts.microsecond // 1000:03d}Z",
            "step": str(step),
            "cat": str(category),
            "input": input_summary or {},
            "reasoning": reasoning.strip(),
            "output": output or {},
        }

        try:
            path = self._ensure_file()
            line = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
            with self._lock:
                with open(path, "a", encoding="utf-8") as f:
                    f.write(line + "\n")
                    f.flush()
            return str(path)
        except Exception:
            # Log the "log failed" event to the standard logger so ops can
            # see it, but do NOT re-raise — thinking-log failures must never
            # break production forecasting.
            logger.warning(
                "Thinking log write failed for step=%s cat=%s",
                step,
                category,
                exc_info=False,
            )
            return None

    # ── internals ───────────────────────────────────────────────────

    def _ensure_file(self) -> Path:
        """Return today's log file path, creating dir+parent as needed.

        Memoises by date so we don't hit the filesystem for every log entry.
        """
        today = datetime.utcnow().strftime("%Y-%m-%d")
        if today != self._day or self._current_path is None:
            self._day = today
            self._current_path = self._log_dir / f"{today}.jsonl"
            self._log_dir.mkdir(parents=True, exist_ok=True)
        return self._current_path


# ── singleton ────────────────────────────────────────────────────
# Import this in any module that wants to emit thinking traces.
# All configuration comes from env vars, read once at import.
thinking_log = ThinkingLogger(
    enabled=_env_bool("THINKING_LOG_ENABLED", True),
    log_dir=os.getenv("THINKING_LOG_DIR", "logs/thinking"),
)