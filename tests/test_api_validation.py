"""
Pytest Unit Tests for API Input Validation
Covers Task 2:
  - Unknown cutoff_time returns HTTP 422 (not a silent default fallback)
  - Bad delivery_date format returns HTTP 422
  - Date outside configured scope (January 2026) returns HTTP 422
  - Valid cutoff and delivery_date returns HTTP 200
  - Validation across day-ahead, analytics, and simulation endpoints
"""

import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_unknown_cutoff_returns_422():
    """An unknown cutoff option must be rejected with HTTP 422 (no silent default)."""
    response = client.get("/api/forecasts/day-ahead", params={
        "delivery_date": "2026-01-15",
        "cutoff_time": "12:00",  # Invalid cutoff
    })
    assert response.status_code == 422
    assert "cutoff_time" in response.text


def test_bad_date_format_returns_422():
    """A non-parseable delivery date must be rejected with HTTP 422."""
    response = client.get("/api/forecasts/day-ahead", params={
        "delivery_date": "not-a-date",
        "cutoff_time": "09:20",
    })
    assert response.status_code == 422


def test_date_outside_scope_returns_422():
    """A date outside the configured scope (e.g. Feb 2026 or Dec 2025) must return HTTP 422."""
    # Future date
    resp_future = client.get("/api/forecasts/day-ahead", params={
        "delivery_date": "2026-02-01",
        "cutoff_time": "09:20",
    })
    assert resp_future.status_code == 422
    assert "out of scope" in resp_future.text

    # Past date
    resp_past = client.get("/api/forecasts/day-ahead", params={
        "delivery_date": "2025-12-31",
        "cutoff_time": "09:20",
    })
    assert resp_past.status_code == 422
    assert "out of scope" in resp_past.text


def test_valid_day_ahead_request_returns_200():
    """Valid delivery_date in January 2026 and valid cutoff returns HTTP 200 with response payload."""
    response = client.get("/api/forecasts/day-ahead", params={
        "delivery_date": "2026-01-15",
        "cutoff_time": "09:20",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["delivery_date"] == "2026-01-15"
    assert data["cutoff_time"] == "09:20"
    assert len(data["periods"]) == 48


def test_analytics_unknown_cutoff_returns_422():
    """Analytics endpoint with invalid cutoff must return HTTP 422."""
    response = client.get("/api/analytics/overall", params={"cutoff_time": "99:99"})
    assert response.status_code == 422


def test_simulation_validation():
    """Simulation endpoint rejects invalid cutoff and out-of-scope date with HTTP 422."""
    # Invalid cutoff
    resp_bad_cutoff = client.post("/api/procurement/simulate", json={
        "delivery_date": "2026-01-15",
        "cutoff_time": "invalid_cutoff",
    })
    assert resp_bad_cutoff.status_code == 422

    # Out of scope date
    resp_bad_date = client.post("/api/procurement/simulate", json={
        "delivery_date": "2026-02-15",
        "cutoff_time": "09:20",
    })
    assert resp_bad_date.status_code == 422


def test_api_dates_scope_metadata():
    """Task 3: /api/dates must return min_date, max_date, default_date, and allowed dates from scope constant."""
    response = client.get("/api/dates")
    assert response.status_code == 200
    data = response.json()
    assert data["min_date"] == "2026-01-01"
    assert data["max_date"] == "2026-01-31"
    assert data["default_date"] == "2026-01-15"
    assert len(data["dates"]) == 31
    assert data["total_expected_sps"] == 1488


def test_db_health_scoped_count():
    """Task 3: Health check must report actuals strictly within scope (1,488 SPs, not 1,537)."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["database"]["actuals_count"] == 1488
    assert data["database"]["raw_actuals_count"] == 1537


def test_monthly_analytics_exact_scope_count():
    """Task 3: Monthly analytics must evaluate exactly 31 * 48 = 1,488 settlement periods."""
    response = client.get("/api/analytics/overall", params={"cutoff_time": "09:20"})
    assert response.status_code == 200
    data = response.json()
    assert data["total_evaluated_points"] == 1488


def test_convergence_valid_start_time_returns_200():
    """Task 5: Valid ISO start_time within January 2026 scope returns HTTP 200."""
    response = client.get("/api/forecasts/convergence", params={"start_time": "2026-01-15T12:00:00Z"})
    assert response.status_code == 200
    data = response.json()
    assert data["targetStartTime"] == "2026-01-15T12:00:00Z"
    assert data["settlementPeriod"] == 25
    assert len(data["revisions"]) > 0


def test_convergence_invalid_timestamp_returns_422():
    """Task 5: Invalid non-ISO timestamp string returns HTTP 422."""
    response = client.get("/api/forecasts/convergence", params={"start_time": "bad-timestamp"})
    assert response.status_code == 422
    assert "Invalid start_time format" in response.text


def test_convergence_out_of_scope_timestamp_returns_422():
    """Task 5: ISO timestamp outside configured delivery scope returns HTTP 422."""
    # Future timestamp in February 2026
    resp_future = client.get("/api/forecasts/convergence", params={"start_time": "2026-02-05T12:00:00Z"})
    assert resp_future.status_code == 422
    assert "outside configured evaluation scope" in resp_future.text

    # Past timestamp in December 2025
    resp_past = client.get("/api/forecasts/convergence", params={"start_time": "2025-12-25T12:00:00Z"})
    assert resp_past.status_code == 422
    assert "outside configured evaluation scope" in resp_past.text


def test_convergence_non_half_hour_timestamp_returns_422():
    """Task 5: ISO timestamp that does not align with a 30-minute settlement period boundary returns HTTP 422."""
    response = client.get("/api/forecasts/convergence", params={"start_time": "2026-01-15T12:17:00Z"})
    assert response.status_code == 422
    assert "not a valid 30-minute settlement period boundary" in response.text
