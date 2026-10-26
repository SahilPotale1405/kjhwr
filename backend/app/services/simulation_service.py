"""
Wind-Risk Hedge Simulation Service
Calculates firm, de-risked wind generation commitments for a Day-Ahead buyer:
Firm Wind = max(0, Wind Forecast - Out-of-Sample Reserve Buffer)
Strictly adheres to data constraints: uses ONLY Elexon FUELHH actuals and WINDFOR forecasts.
No demand, price, cashout, or cost assumptions.

Buffer sizing methodology:
  np.percentile(signed_errors, confidence * 100) over ALL settlement periods
  of ALL delivery days strictly before day D (pooled, expanding window).
"""

from typing import Dict, Any, List, Optional
import numpy as np

from .forecast_service import get_day_ahead_forecasts
from ..config import get_scope_delivery_dates
from ..models import (
    WindHedgeSimulationRequest,
    WindHedgeSimulationResponse,
    WalkForwardCoverageResponse,
    WorstDayCoverageItem,
)


def simulate_procurement(req: WindHedgeSimulationRequest) -> WindHedgeSimulationResponse:
    """
    Simulates Day-Ahead wind volume hedging for delivery date D:
    Sizes the upward reserve buffer out-of-sample over ALL settlement periods of ALL delivery days
    strictly before day D (pooled expanding window):
      buffer = np.percentile(signed_errors, confidence * 100)
    Firm wind = max(0.0, forecast - buffer)
    For Day 1 (2026-01-01), returns buffer_available=False with an explicit explanatory message.
    """
    # 1. Fetch Day-Ahead forecast and actuals for delivery date D
    da = get_day_ahead_forecasts(req.delivery_date, cutoff_time=req.cutoff_time)
    total_fc_mwh = da.total_forecast_mwh
    total_act_mwh = da.total_actual_mwh

    # 2. Strict out-of-sample delivery days strictly before day D
    all_scope_dates = get_scope_delivery_dates()
    prior_dates = [d for d in all_scope_dates if d < req.delivery_date]

    # For Day 1 (2026-01-01), no prior data exists: return buffer_available=False without in-sample fallback
    if not prior_dates:
        periods = []
        for p in da.periods:
            periods.append({
                "settlementPeriod": p.settlementPeriod,
                "startTime": p.startTime,
                "wind_forecast_mw": p.forecast_mw,
                "wind_actual_mw": p.actual_mw,
                "reserve_buffer_mw": None,
                "firm_wind_mw": None,
                "deficit_mw": None,
                "firm_satisfied": None,
            })
        return WindHedgeSimulationResponse(
            delivery_date=req.delivery_date,
            cutoff_time=req.cutoff_time,
            confidence_level=req.confidence_level,
            buffer_available=False,
            message="No prior delivery days in January 2026 dataset to fit an out-of-sample buffer.",
            recommended_reserve_buffer_mw=None,
            total_forecast_wind_mwh=total_fc_mwh,
            total_firm_wind_mwh=None,
            total_actual_wind_mwh=total_act_mwh,
            firm_reliability_percent=None,
            buffer_sample_window=None,
            periods=periods,
        )

    # 3. Pooled expanding window: Collect signed errors (forecast - actual) over ALL settlement periods
    # of ALL delivery days strictly before day D
    # Reasoning: A buyer needs reserve capacity only when wind generation under-delivers
    # (actual < forecast, i.e., signed error forecast - actual > 0). When actual > forecast, wind is long,
    # which does not trigger upward reserve procurement.
    # We use np.percentile(signed_errors, conf * 100), the standard Value-at-Risk (VaR) of short volume risk.
    prior_signed_errors: List[float] = []
    for d_str in prior_dates:
        hist_da = get_day_ahead_forecasts(d_str, cutoff_time=req.cutoff_time)
        for hp in hist_da.periods:
            if hp.actual_mw is not None and hp.forecast_mw is not None:
                prior_signed_errors.append(hp.forecast_mw - hp.actual_mw)

    # Size single pooled buffer as empirical percentile of signed errors
    conf_pct = req.confidence_level * 100.0
    buffer_mw = max(0.0, round(float(np.percentile(prior_signed_errors, conf_pct)), 1))

    # Evaluate Day D periods
    periods = []
    for p in da.periods:
        fc_val = p.forecast_mw
        act_val = p.actual_mw

        firm_wind = max(0.0, round(fc_val - buffer_mw, 1)) if fc_val is not None else None
        if act_val is not None and firm_wind is not None:
            satisfied = bool(act_val >= firm_wind)
            deficit = max(0.0, round(firm_wind - act_val, 1))
        else:
            satisfied = None
            deficit = None

        periods.append({
            "settlementPeriod": p.settlementPeriod,
            "startTime": p.startTime,
            "wind_forecast_mw": fc_val,
            "wind_actual_mw": act_val,
            "reserve_buffer_mw": buffer_mw,
            "firm_wind_mw": firm_wind,
            "deficit_mw": deficit,
            "firm_satisfied": satisfied,
        })

    # Day D totals and reliability
    firm_periods_mw = [p["firm_wind_mw"] for p in periods if p["firm_wind_mw"] is not None]
    total_firm_mwh = round(sum(firm_periods_mw) * 0.5, 1) if firm_periods_mw else 0.0

    evaluated_count = sum(1 for p in periods if p["firm_satisfied"] is not None)
    satisfied_count = sum(1 for p in periods if p["firm_satisfied"] is True)
    reliability_pct = round((satisfied_count / evaluated_count * 100.0), 1) if evaluated_count > 0 else None

    buffer_sample_window = (
        f"expanding_prior_{len(prior_dates)}_days "
        f"({prior_dates[0]} to {prior_dates[-1]}, pooled {len(prior_signed_errors)} SPs)"
    )

    return WindHedgeSimulationResponse(
        delivery_date=req.delivery_date,
        cutoff_time=req.cutoff_time,
        confidence_level=req.confidence_level,
        buffer_available=True,
        message=None,
        recommended_reserve_buffer_mw=buffer_mw,
        total_forecast_wind_mwh=total_fc_mwh,
        total_firm_wind_mwh=total_firm_mwh,
        total_actual_wind_mwh=total_act_mwh,
        firm_reliability_percent=reliability_pct,
        buffer_sample_window=buffer_sample_window,
        periods=periods,
    )


def get_walk_forward_coverage(
    cutoff_time: str = "09:20",
    confidence_level: float = 0.90,
) -> WalkForwardCoverageResponse:
    """
    Evaluates month-level walk-forward coverage of the pooled expanding reserve buffer
    across all delivery days in the configured evaluation scope (from Day 2 onwards):
    For each day D, fits the buffer on earlier days only (days 1 to D-1),
    measures the share of periods where error <= buffer (or equivalently, actual >= firm_wind),
    and returns target vs achieved coverage and worst-day coverage.
    """
    all_dates = get_scope_delivery_dates()
    daily_errors: Dict[str, List[float]] = {}
    for d in all_dates:
        da = get_day_ahead_forecasts(d, cutoff_time=cutoff_time)
        daily_errors[d] = [
            hp.forecast_mw - hp.actual_mw
            for hp in da.periods
            if hp.actual_mw is not None and hp.forecast_mw is not None
        ]

    conf_pct = confidence_level * 100.0
    total_covered = 0
    total_evaluated = 0
    worst_day_rate = 100.0
    worst_day_date = all_dates[1] if len(all_dates) > 1 else all_dates[0]
    day_results: List[Dict[str, Any]] = []

    # Evaluate out-of-sample delivery days from Day 2 through the end of the configured scope (indices 1 to len-1)
    for idx in range(1, len(all_dates)):
        day_date = all_dates[idx]
        # Pool all signed errors from earlier days strictly before day D
        prior_signed_errors = [e for prev_d in all_dates[:idx] for e in daily_errors[prev_d]]
        buf = max(0.0, float(np.percentile(prior_signed_errors, conf_pct)))

        day_errs = daily_errors[day_date]
        covered_count = sum(1 for e in day_errs if e <= buf)
        eval_count = len(day_errs)

        total_covered += covered_count
        total_evaluated += eval_count

        day_cov_rate = (covered_count / eval_count * 100.0) if eval_count > 0 else 0.0
        if day_cov_rate < worst_day_rate:
            worst_day_rate = day_cov_rate
            worst_day_date = day_date

        day_results.append({
            "date": day_date,
            "coverage_percent": round(day_cov_rate, 1),
            "buffer_mw": round(buf, 1),
            "min_error_mw": round(min(day_errs), 1) if day_errs else 0.0,
            "max_error_mw": round(max(day_errs), 1) if day_errs else 0.0,
            "covered_periods": covered_count,
            "total_periods": eval_count,
        })

    achieved_cov = round((total_covered / total_evaluated * 100.0), 2) if total_evaluated > 0 else 0.0
    # Top 4 worst days by coverage percentage
    worst_days_sorted = sorted(day_results, key=lambda x: x["coverage_percent"])[:4]
    worst_days_models = [WorstDayCoverageItem(**d) for d in worst_days_sorted]

    return WalkForwardCoverageResponse(
        cutoff_time=cutoff_time,
        confidence_level=confidence_level,
        target_coverage_percent=round(confidence_level * 100.0, 1),
        achieved_coverage_percent=achieved_cov,
        total_evaluated_periods=total_evaluated,
        total_covered_periods=total_covered,
        evaluated_days_count=len(all_dates) - 1,
        worst_day_date=worst_day_date,
        worst_day_coverage_percent=round(worst_day_rate, 1),
        evaluation_window=f"{all_dates[1]} to {all_dates[-1]} (expanding prior days)",
        worst_days=worst_days_models,
    )
