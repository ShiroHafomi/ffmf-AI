"""Shared rate limiter (slowapi) for the public prediction routes.

Limit is per client IP and configured via RATE_LIMIT_PER_MINUTE (default 60).
Route handlers opt in with the `@limiter.limit(DEFAULT_LIMIT)` decorator and
must accept a `request: Request` parameter (slowapi requirement).
"""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

_RATE_LIMIT = os.getenv("RATE_LIMIT_PER_MINUTE", "60")
try:
    PER_MINUTE = int(_RATE_LIMIT)
except ValueError:
    PER_MINUTE = 60
if PER_MINUTE < 1:
    PER_MINUTE = 1

limiter = Limiter(key_func=get_remote_address)
DEFAULT_LIMIT = f"{PER_MINUTE}/minute"
