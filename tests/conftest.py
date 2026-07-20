"""Shared pytest fixtures and helpers for the FFMS AI service tests."""

import pytest


def collect_paths(app) -> set:
    """Recursively collect every route path registered on a FastAPI/Starlette app.

    FastAPI >= 0.139 wraps each included router in a ``_IncludedRouter`` object
    whose real routes live under ``.original_router.routes``; older versions
    flatten routes directly onto ``app.routes``. Walking both shapes keeps route
    registration tests stable across FastAPI upgrades.
    """
    paths: set = set()

    def _walk(obj):
        for route in getattr(obj, "routes", []):
            if hasattr(route, "original_router"):
                _walk(route.original_router)
            elif hasattr(route, "routes"):
                _walk(route)
            elif hasattr(route, "path"):
                paths.add(route.path)

    _walk(app)
    return paths


@pytest.fixture
def registered_paths():
    """All route paths currently registered on the application."""
    from main import app

    return collect_paths(app)
