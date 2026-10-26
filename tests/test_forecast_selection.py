"""
Pytest Unit Tests for Selection Logic & Interpolation Rules
Covers:
  (a) Forecast published after cutoff is never selected
  (b) Latest forecast published before cutoff wins
  (c) Forecast published exactly at cutoff is eligible
  (d) Target with no eligible forecast is excluded (None) and counted
  (e) Half-hour (:30) periods use documented linear interpolation between H and H+1
"""

import pytest
from backend.app.services.forecast_service import (
    select_latest,
    interpolate_forecast_for_half_hour,
)


def test_forecast_after_cutoff_is_never_selected():
    """Test (a): A forecast published strictly after the decision cutoff must never be selected."""
    cutoff = "2026-01-14T09:20:00Z"
    rows = [
        {
            "startTime": "2026-01-15T12:00:00Z",
            "publishTime": "2026-01-14T09:25:00Z",  # 5 minutes after cutoff
            "generation": 5000.0,
        },
        {
            "startTime": "2026-01-15T12:00:00Z",
            "publishTime": "2026-01-14T07:30:00Z",  # Eligible prior forecast
            "generation": 4200.0,
        },
    ]

    selected = select_latest(rows, cutoff)

    assert "2026-01-15T12:00:00Z" in selected
    # Must choose the 07:30 run (4200.0), NOT the 09:25 run (5000.0)
    assert selected["2026-01-15T12:00:00Z"]["publishTime"] == "2026-01-14T07:30:00Z"
    assert selected["2026-01-15T12:00:00Z"]["generation"] == pytest.approx(4200.0)


def test_latest_forecast_before_cutoff_wins():
    """Test (b): Among eligible forecasts published before cutoff, the latest one wins."""
    cutoff = "2026-01-14T09:20:00Z"
    rows = [
        {
            "startTime": "2026-01-15T14:00:00Z",
            "publishTime": "2026-01-14T02:30:00Z",
            "generation": 3100.0,
        },
        {
            "startTime": "2026-01-15T14:00:00Z",
            "publishTime": "2026-01-14T04:30:00Z",
            "generation": 3300.0,
        },
        {
            "startTime": "2026-01-15T14:00:00Z",
            "publishTime": "2026-01-14T07:30:00Z",  # Latest before 09:20
            "generation": 3600.0,
        },
    ]

    selected = select_latest(rows, cutoff)

    assert selected["2026-01-15T14:00:00Z"]["publishTime"] == "2026-01-14T07:30:00Z"
    assert selected["2026-01-15T14:00:00Z"]["generation"] == pytest.approx(3600.0)


def test_forecast_published_exactly_at_cutoff_is_eligible():
    """
    Test (c): A forecast published exactly at the cutoff (publishTime == cutoff) is eligible.
    CRUCIAL: If publishTime <= cutoff is changed to < cutoff, this test MUST fail.
    """
    cutoff = "2026-01-14T09:20:00Z"
    rows = [
        {
            "startTime": "2026-01-15T16:00:00Z",
            "publishTime": "2026-01-14T09:20:00Z",  # Exactly at cutoff
            "generation": 7777.0,
        }
    ]

    selected = select_latest(rows, cutoff)

    assert "2026-01-15T16:00:00Z" in selected, "Forecast published exactly at cutoff must be selected"
    assert selected["2026-01-15T16:00:00Z"]["generation"] == pytest.approx(7777.0)


def test_target_with_no_eligible_forecast_is_excluded_and_counted():
    """Test (d): A target with no eligible forecast returns None (not 0.0) and is counted."""
    cutoff = "2026-01-14T09:20:00Z"
    # All available forecasts are published after cutoff
    rows = [
        {
            "startTime": "2026-01-15T18:00:00Z",
            "publishTime": "2026-01-14T11:30:00Z",  # After cutoff
            "generation": 6500.0,
        }
    ]

    selected = select_latest(rows, cutoff)

    # 18:00 has no eligible forecast
    assert "2026-01-15T18:00:00Z" not in selected
    val = selected.get("2026-01-15T18:00:00Z")
    assert val is None, "Missing forecast must be None, not silently 0.0"


def test_cutoff_before_any_forecast_exists_leaves_none_and_counts_missing(monkeypatch):
    """
    Task 7: Simulate a cutoff before any forecast exists.
    Must return periods_without_forecast == 48, with forecast_mw and error fields None (not 0.0).
    """
    from datetime import datetime, timezone
    from backend.app.services.forecast_service import get_day_ahead_forecasts

    # Mock compute_cutoff_datetime_utc to return 2025-01-01 (before any 2026 forecast runs were published)
    mock_cutoff = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    mock_opt = {"id": "09:20", "label": "09:20 (EPEX hourly GB)", "description": "Mock gate closure"}
    monkeypatch.setattr(
        "backend.app.services.forecast_service.compute_cutoff_datetime_utc",
        lambda d, c: (mock_cutoff, mock_opt),
    )

    res = get_day_ahead_forecasts("2026-01-15", cutoff_time="09:20")

    # All 48 periods must be recorded as missing forecasts
    assert res.periods_without_forecast == 48
    assert res.total_forecast_mwh == pytest.approx(0.0)
    assert res.mae_mw is None
    assert res.rmse_mw is None
    assert res.wape_percent is None
    assert res.mean_bias_mw is None

    # Every period must have forecast_mw = None, error_mw = None (never silently 0.0)
    for p in res.periods:
        assert p.forecast_mw is None
        assert p.forecast_publish_time is None
        assert p.error_mw is None
        assert p.abs_error_mw is None
        assert p.pct_error is None


def test_half_hour_periods_use_documented_hourly_interpolation():
    """
    Test (e): :30 settlement periods linearly interpolate between hour H and H+1:
    (generation(H) + generation(H+1)) / 2.0. If either is missing, returns (None, None).
    """
    h1 = {"startTime": "2026-01-15T12:00:00Z", "publishTime": "2026-01-14T07:30:00Z", "generation": 1000.0}
    h2 = {"startTime": "2026-01-15T13:00:00Z", "publishTime": "2026-01-14T07:30:00Z", "generation": 3000.0}

    # Case 1: Both H and H+1 exist -> (1000 + 3000) / 2 = 2000.0
    fc, pub = interpolate_forecast_for_half_hour(h1, h2)
    assert fc == pytest.approx(2000.0)
    assert pub == "2026-01-14T07:30:00Z"

    # Case 2: Hour H missing -> cannot interpolate, must be None (not 0.0)
    fc_missing_h1, pub_missing_h1 = interpolate_forecast_for_half_hour(None, h2)
    assert fc_missing_h1 is None
    assert pub_missing_h1 is None

    # Case 3: Hour H+1 missing -> cannot interpolate, must be None (not 0.0)
    fc_missing_h2, pub_missing_h2 = interpolate_forecast_for_half_hour(h1, None)
    assert fc_missing_h2 is None
    assert pub_missing_h2 is None
