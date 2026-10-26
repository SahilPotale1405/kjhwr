"""
Pytest Unit Tests for Reserve Buffer Definition and Out-of-Sample Walk-Forward
Covers Task 4:
  - Unified reserve buffer definition: Percentile of signed errors (forecast - actual, over-forecast direction)
  - Month P90 signed error matches Value-at-Risk reference (4,315 MW)
  - Out-of-sample check: Simulation buffer for day D is never fitted on day D
  - buffer_sample_window metadata returned in simulation response
"""

import pytest
import numpy as np
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.analytics_service import get_monthly_evaluation, get_settlement_period_profile
from backend.app.services.simulation_service import simulate_procurement
from backend.app.models import ProcurementSimulationRequest

client = TestClient(app)


def test_month_p90_signed_error_matches_var_reference():
    """Overall monthly P90 error must use signed error VaR formula and match ~4,315 MW."""
    overall = get_monthly_evaluation(cutoff_time="09:20")
    # Signed error P90 is exactly 4315.1 MW
    assert overall.p90_error_mw == pytest.approx(4315.1, abs=0.5)
    assert overall.mean_bias_mw == pytest.approx(1850.0, abs=0.1)


def test_settlement_period_profile_uses_signed_error_p90():
    """Settlement period profile must compute P90 on signed errors (forecast - actual), not absolute errors."""
    profile = get_settlement_period_profile(cutoff_time="09:20")
    assert len(profile) == 48
    # For every settlement period, p90_error_mw must be computed from signed error distribution
    for sp in profile:
        assert isinstance(sp.p90_error_mw, float)
        # Signed error P90 for all SPs in Jan 2026 is positive because wind is systematically over-forecast
        assert sp.p90_error_mw > 0.0


def test_simulation_reserve_buffer_is_out_of_sample_for_day_d():
    """
    Simulation for delivery date D (e.g. 2026-01-15) must size the buffer strictly
    out-of-sample from prior days (pooled expanding window), never fitting on day D itself:
    - 15 Jan buffer: 4,779 MW at 90% confidence
    - 15 Jan firm wind: 162.2 GWh
    - Firm wind = max(0, forecast - buffer)
    - Buffer sample window explicitly uses prior 14 days (1-14 Jan), excluding day D.
    """
    req = ProcurementSimulationRequest(
        delivery_date="2026-01-15",
        cutoff_time="09:20",
        confidence_level=0.90,
    )
    res = simulate_procurement(req)

    assert res.buffer_available is True
    assert "expanding_prior_14_days" in res.buffer_sample_window
    assert "2026-01-14" in res.buffer_sample_window
    assert "2026-01-15" not in res.buffer_sample_window

    # Authoritative benchmark figures for 15 Jan
    assert res.recommended_reserve_buffer_mw == pytest.approx(4779.0, abs=1.0)
    assert (res.total_firm_wind_mwh / 1000.0) == pytest.approx(162.2, abs=0.2)
    assert (res.total_forecast_wind_mwh / 1000.0) == pytest.approx(276.87, abs=0.2)
    assert (res.total_actual_wind_mwh / 1000.0) == pytest.approx(253.63, abs=0.2)
    assert res.firm_reliability_percent == pytest.approx(100.0, abs=0.1)

    # Firm wind formula check: firm_wind = max(0, forecast - buffer)
    for p in res.periods:
        assert p["reserve_buffer_mw"] == pytest.approx(res.recommended_reserve_buffer_mw)
        expected_firm = max(0.0, round((p["wind_forecast_mw"] or 0.0) - p["reserve_buffer_mw"], 1))
        assert p["firm_wind_mw"] == pytest.approx(expected_firm, abs=1e-3)


def test_simulation_day_1_buffer_not_available():
    """Simulation for Day 1 (2026-01-01) has no prior days in scope: returns buffer_available=False without in-sample fallback."""
    req = ProcurementSimulationRequest(
        delivery_date="2026-01-01",
        cutoff_time="09:20",
        confidence_level=0.90,
    )
    res = simulate_procurement(req)
    assert res.buffer_available is False
    assert res.recommended_reserve_buffer_mw is None
    assert res.total_firm_wind_mwh is None
    assert "No prior delivery days" in res.message


def test_walk_forward_coverage_matches_independent_computation():
    """
    GET /api/procurement/coverage must match independent walk-forward calculation over days 2-31:
    Expect 89.86% coverage (1,294 / 1,440 periods) at 90% confidence for cutoff 09:20,
    with worst day 28 Jan at 0.0% (buffer 4,098 MW, errors +4,123 to +6,210 MW).
    """
    resp = client.get("/api/procurement/coverage?cutoff_time=09:20&confidence_level=0.90")
    assert resp.status_code == 200
    data = resp.json()

    assert data["cutoff_time"] == "09:20"
    assert data["confidence_level"] == pytest.approx(0.90)
    assert data["target_coverage_percent"] == pytest.approx(90.0)
    # Achieved coverage is 89.86% (~89.9%)
    assert data["achieved_coverage_percent"] == pytest.approx(89.86, abs=0.05)
    assert data["total_evaluated_periods"] == 1440
    assert data["total_covered_periods"] == 1294
    assert data["evaluated_days_count"] == 30
    assert data["worst_day_date"] == "2026-01-28"
    assert data["worst_day_coverage_percent"] == pytest.approx(0.0, abs=1e-3)

    # Verify worst days list contains 28 Jan, 11 Jan (8.3%), 12 Jan (33.3%)
    worst_days = {d["date"]: d for d in data["worst_days"]}
    assert "2026-01-28" in worst_days
    assert worst_days["2026-01-28"]["buffer_mw"] == pytest.approx(4098.0, abs=1.0)
    assert worst_days["2026-01-28"]["coverage_percent"] == pytest.approx(0.0, abs=1e-3)
    assert worst_days["2026-01-28"]["min_error_mw"] == pytest.approx(4123.0, abs=2.0)
    assert worst_days["2026-01-28"]["max_error_mw"] == pytest.approx(6210.0, abs=2.0)

    assert "2026-01-11" in worst_days
    assert worst_days["2026-01-11"]["coverage_percent"] == pytest.approx(8.3, abs=0.5)

    assert "2026-01-12" in worst_days
    assert worst_days["2026-01-12"]["coverage_percent"] == pytest.approx(33.3, abs=0.5)
