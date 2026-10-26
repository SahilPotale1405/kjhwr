"""
Pytest Unit Tests for Numerical Reproducibility of Benchmark Reference Values
Validates the exact reference figures for GB Day-Ahead wholesale buyers:
- Cutoff 09:20 (EPEX hourly GB, default): 1,488 SPs, MAE 2,127.82, bias +1,850.0, RMSE 2,605.69, WAPE 18.37%,
  over-forecast 84.95%, P90 signed error 4,315.1 MW, P95 5,334.45 MW, actual 8,616.07 GWh, forecast 9,992.47 GWh.
- Delivery Day 15 Jan 2026: MAE = bias = 968.48 MW, forecast 276.87 GWh, actual 253.63 GWh,
  peak 15,834 MW at SP 1, min 8,864 MW at SP 33.
- Other cutoffs:
  09:50 -> MAE 2,107.75, bias +1,838.94
  15:30 -> MAE 1,966.45, bias +1,814.05
"""

import pytest
from backend.app.services.analytics_service import get_monthly_evaluation
from backend.app.services.forecast_service import get_day_ahead_forecasts


def test_reference_values_cutoff_0920_january():
    """Validates full January 2026 evaluation metrics at 09:20 cutoff against authoritative reference values."""
    eval_0920 = get_monthly_evaluation("09:20")

    assert eval_0920.total_evaluated_points == 1488
    assert eval_0920.mae_mw == pytest.approx(2127.82, abs=0.05)
    assert eval_0920.mean_bias_mw == pytest.approx(1850.00, abs=0.05)
    assert eval_0920.rmse_mw == pytest.approx(2605.69, abs=0.05)
    assert eval_0920.wape_percent == pytest.approx(18.37, abs=0.05)
    assert eval_0920.pct_over_forecast == pytest.approx(84.95, abs=0.05)
    assert eval_0920.p90_error_mw == pytest.approx(4315.10, abs=0.1)
    assert eval_0920.p95_error_mw == pytest.approx(5334.45, abs=0.1)
    assert eval_0920.total_actual_wind_gwh == pytest.approx(8616.07, abs=0.1)
    assert eval_0920.total_forecast_wind_gwh == pytest.approx(9992.47, abs=0.1)


def test_reference_values_delivery_day_15_january():
    """Validates benchmark delivery day 15 Jan 2026 metrics at 09:20 cutoff against reference values."""
    da_15 = get_day_ahead_forecasts("2026-01-15", cutoff_time="09:20")

    assert da_15.periods_without_forecast == 0
    assert len(da_15.periods) == 48
    assert da_15.mae_mw == pytest.approx(968.48, abs=0.05)
    assert da_15.mean_bias_mw == pytest.approx(968.48, abs=0.05)
    assert (da_15.total_forecast_mwh / 1000.0) == pytest.approx(276.87, abs=0.05)
    assert (da_15.total_actual_mwh / 1000.0) == pytest.approx(253.63, abs=0.05)
    assert da_15.peak_forecast_mw == pytest.approx(15834.0, abs=1.0)
    assert da_15.peak_forecast_sp == 1
    assert da_15.min_forecast_mw == pytest.approx(8864.0, abs=1.0)
    assert da_15.over_forecast_count == 48
    assert da_15.under_forecast_count == 0


def test_reference_values_cutoff_0950():
    """Validates full January 2026 evaluation metrics at 09:50 cutoff (Nord Pool / N2EX)."""
    eval_0950 = get_monthly_evaluation("09:50")

    assert eval_0950.total_evaluated_points == 1488
    assert eval_0950.mae_mw == pytest.approx(2107.75, abs=0.05)
    assert eval_0950.mean_bias_mw == pytest.approx(1838.94, abs=0.05)


def test_reference_values_cutoff_1530():
    """Validates full January 2026 evaluation metrics at 15:30 cutoff (GB half-hourly auction)."""
    eval_1530 = get_monthly_evaluation("15:30")

    assert eval_1530.total_evaluated_points == 1488
    assert eval_1530.mae_mw == pytest.approx(1966.45, abs=0.05)
    assert eval_1530.mean_bias_mw == pytest.approx(1814.05, abs=0.05)
