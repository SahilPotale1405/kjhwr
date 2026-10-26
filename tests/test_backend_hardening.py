"""
Pytest Unit Tests for Task 6: Backend Hardening and Correctness
- Day-level WAPE: denominator sums actuals only for periods having a forecast
- Static file serving path traversal protection via os.path.commonpath
- Specific exception handling in lead time computation
"""

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.app.main import app, serve_frontend
from backend.app.services.forecast_service import compute_lead_time_hours, get_day_ahead_forecasts

client = TestClient(app)


def test_lead_time_specific_exception_handling():
    """Invalid timestamp strings return 0.0 without broad uncaught errors."""
    assert compute_lead_time_hours("invalid_publish", "2026-01-15T12:00:00Z") == pytest.approx(0.0)
    assert compute_lead_time_hours("2026-01-15T12:00:00Z", "invalid_target") == pytest.approx(0.0)


def test_day_level_wape_denominator_excludes_missing_forecast_actuals():
    """
    Day-level WAPE = sum(abs_errors) / sum(actuals of evaluated periods) * 100.
    For benchmark day 2026-01-15:
      Total actuals sum = 507,252 MW (253,626 MWh * 2).
      Total absolute errors sum = 46,487.04 MW (48 * 968.48 MW).
      WAPE = 46487.04 / 507252 * 100 = 9.16%.
    """
    res = get_day_ahead_forecasts("2026-01-15", cutoff_time="09:20")
    assert res.wape_percent is not None
    assert res.wape_percent == pytest.approx(9.16, abs=0.05)


def test_directory_traversal_is_blocked():
    """Path traversal attempts outside STATIC_DIR via commonpath check must raise HTTP 403."""
    with pytest.raises(HTTPException) as exc_info:
        serve_frontend("../config.py")
    assert exc_info.value.status_code == 403
    assert "Access denied" in exc_info.value.detail
