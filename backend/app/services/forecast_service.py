"""
Forecast Service
Handles Day-Ahead forecast extraction based on decision cutoff rules,
interpolation between hourly WINDFOR forecasts and 30-min settlement periods,
and forecast evolution / revision history.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import numpy as np

from ..database import get_db_connection
from ..config import compute_cutoff_datetime_utc, CUTOFF_OPTIONS, DEFAULT_DA_CUTOFF_KEY
from ..models import (
    DayAheadResponse,
    PeriodPoint,
    ForecastRevisionItem,
    ForecastConvergenceResponse,
)


def compute_lead_time_hours(publish_time_iso: str, target_time_iso: str) -> float:
    try:
        pub = datetime.fromisoformat(publish_time_iso.replace("Z", "+00:00"))
        tgt = datetime.fromisoformat(target_time_iso.replace("Z", "+00:00"))
        return round((tgt - pub).total_seconds() / 3600.0, 2)
    except (ValueError, TypeError, AttributeError):
        return 0.0


def select_latest(rows: List[Dict[str, Any]], cutoff: str) -> Dict[str, Dict[str, Any]]:
    """
    Pure selection rule: Given forecast rows with 'startTime', 'publishTime', and 'generation',
    selects rows published on or before the cutoff (publishTime <= cutoff),
    and for each distinct startTime picks the one with the maximum publishTime.
    Returns a dictionary keyed by startTime.
    """
    selected: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        pub = r.get("publishTime")
        start = r.get("startTime")
        if pub is None or start is None:
            continue
        # Eligible only if published at or before the decision cutoff
        if pub <= cutoff:
            if start not in selected or pub > selected[start]["publishTime"]:
                selected[start] = r
    return selected


def interpolate_forecast_for_half_hour(
    h1_val: Optional[Dict[str, Any]],
    h2_val: Optional[Dict[str, Any]],
) -> tuple[Optional[float], Optional[str]]:
    """
    Documented half-hour interpolation rule:
    WINDFOR forecasts are published at hourly intervals (:00).
    For half-hour settlement periods (:30), linearly interpolate between
    hour H and hour H+1: (generation(H) + generation(H+1)) / 2.0.
    If either hour H or H+1 has no eligible forecast, returns (None, None).
    """
    if h1_val is not None and h2_val is not None:
        fc = (float(h1_val["generation"]) + float(h2_val["generation"])) / 2.0
        pub = max(h1_val["publishTime"], h2_val["publishTime"])
        return fc, pub
    return None, None


def get_day_ahead_forecasts(
    delivery_date: str,
    cutoff_time: str = DEFAULT_DA_CUTOFF_KEY,
) -> DayAheadResponse:
    """
    Extracts the latest wind generation forecast available before the decision cutoff.
    Decision cutoff is evaluated in UK local time on Day D-1 and converted to UTC via zoneinfo('Europe/London').
    """
    cutoff_utc_dt, cutoff_opt = compute_cutoff_datetime_utc(delivery_date, cutoff_time)
    cutoff_iso = cutoff_utc_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    target_dt = datetime.strptime(delivery_date, "%Y-%m-%d")

    available_cutoffs_list = [
        {"id": k, "label": v["label"], "description": v["description"]}
        for k, v in CUTOFF_OPTIONS.items()
    ]

    with get_db_connection() as conn:
        cur = conn.cursor()

        # 1. Fetch all FUELHH actuals for the delivery date (48 settlement periods)
        cur.execute(
            """
            SELECT startTime, settlementPeriod, generation
            FROM actuals
            WHERE settlementDate = ?
            ORDER BY startTime
        """,
            (delivery_date,),
        )
        actual_rows = {row["startTime"]: row for row in cur.fetchall()}

        # 2. Fetch raw WINDFOR hourly forecast points for the delivery day window
        # We query for startTimes covering the delivery date plus the next hour for interpolation
        next_day_first_hour = (target_dt + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00Z")
        start_bound = f"{delivery_date}T00:00:00Z"
        end_bound = next_day_first_hour

        cur.execute(
            """
            SELECT startTime, generation, publishTime
            FROM forecasts
            WHERE startTime >= ? AND startTime <= ?
            ORDER BY startTime, publishTime ASC
        """,
            (start_bound, end_bound),
        )
        raw_forecast_rows = [dict(row) for row in cur.fetchall()]
        hourly_forecasts = select_latest(raw_forecast_rows, cutoff_iso)

        # Generate all 48 settlement periods for the delivery date
        periods: List[PeriodPoint] = []
        periods_without_forecast = 0
        total_actual_mw_sum = 0.0
        total_forecast_mw_sum = 0.0
        wape_actual_mw_sum = 0.0
        has_actuals = len(actual_rows) > 0
        over_count = 0
        under_count = 0
        errors = []
        abs_errors = []

        peak_fc_mw = -1.0
        peak_fc_sp = 1
        min_fc_mw = float("inf")

        for sp in range(1, 49):
            # Calculate target start time
            sp_minute_offset = (sp - 1) * 30
            sp_time = target_dt + timedelta(minutes=sp_minute_offset)
            sp_iso = sp_time.strftime("%Y-%m-%dT%H:%M:%SZ")

            # Determine actual if available
            actual_mw = None
            if sp_iso in actual_rows and actual_rows[sp_iso]["generation"] is not None:
                actual_mw = float(actual_rows[sp_iso]["generation"])
                total_actual_mw_sum += actual_mw

            # Determine forecast:
            # If on the hour (:00), use direct hourly forecast
            # If on the half hour (:30), linearly interpolate between current hour and next hour
            hour_iso = sp_time.strftime("%Y-%m-%dT%H:00:00Z")
            next_hour_time = sp_time.replace(minute=0, second=0) + timedelta(hours=1)
            next_hour_iso = next_hour_time.strftime("%Y-%m-%dT%H:00:00Z")

            fc_mw: Optional[float] = None
            pub_time: Optional[str] = None

            if sp_iso.endswith(":00:00Z"):
                h_val = hourly_forecasts.get(hour_iso)
                if h_val is not None and h_val.get("generation") is not None:
                    fc_mw = float(h_val["generation"])
                    pub_time = h_val["publishTime"]
            else:
                # Half-hour: documented interpolation rule
                h1_val = hourly_forecasts.get(hour_iso)
                h2_val = hourly_forecasts.get(next_hour_iso)
                fc_mw, pub_time = interpolate_forecast_for_half_hour(h1_val, h2_val)

            lead_hours: Optional[float] = None
            err_mw: Optional[float] = None
            abs_err_mw: Optional[float] = None
            pct_err: Optional[float] = None

            # Missing forecasts: do NOT silently fall back to 0.0; use None and exclude from metrics
            if fc_mw is None:
                periods_without_forecast += 1
            else:
                total_forecast_mw_sum += fc_mw

                if fc_mw > peak_fc_mw:
                    peak_fc_mw = fc_mw
                    peak_fc_sp = sp
                if fc_mw < min_fc_mw:
                    min_fc_mw = fc_mw

                if pub_time:
                    lead_hours = compute_lead_time_hours(pub_time, sp_iso)

                if actual_mw is not None:
                    err_mw = round(fc_mw - actual_mw, 2)
                    abs_err_mw = round(abs(err_mw), 2)
                    pct_err = round((abs_err_mw / actual_mw * 100.0), 2) if actual_mw > 0 else 0.0
                    errors.append(err_mw)
                    abs_errors.append(abs_err_mw)
                    # Denominator of WAPE: sum actuals only for periods having an eligible forecast
                    wape_actual_mw_sum += actual_mw

                    if err_mw > 0:
                        over_count += 1
                    elif err_mw < 0:
                        under_count += 1

            periods.append(
                PeriodPoint(
                    startTime=sp_iso,
                    settlementPeriod=sp,
                    actual_mw=actual_mw,
                    forecast_mw=round(fc_mw, 2) if fc_mw is not None else None,
                    forecast_publish_time=pub_time,
                    lead_time_hours=lead_hours,
                    error_mw=err_mw,
                    abs_error_mw=abs_err_mw,
                    pct_error=pct_err,
                )
            )

        mae = float(np.mean(abs_errors)) if abs_errors else None
        rmse = float(np.sqrt(np.mean([e**2 for e in errors]))) if errors else None
        mean_bias = float(np.mean(errors)) if errors else None
        wape = (float(sum(abs_errors)) / wape_actual_mw_sum * 100.0) if wape_actual_mw_sum > 0 else None

        # In UK electricity, 1 settlement period is 30 mins = 0.5 hours.
        # Total MWh = Sum(MW) * 0.5 hours
        total_act_mwh = round(total_actual_mw_sum * 0.5, 2) if has_actuals else None
        total_fc_mwh = round(total_forecast_mw_sum * 0.5, 2)

        return DayAheadResponse(
            delivery_date=delivery_date,
            decision_cutoff_utc=cutoff_iso,
            decision_time_used=cutoff_opt["id"],
            cutoff_time=cutoff_opt["id"],
            cutoff_label=cutoff_opt["label"],
            available_cutoffs=available_cutoffs_list,
            total_actual_mwh=total_act_mwh,
            total_forecast_mwh=total_fc_mwh,
            peak_forecast_mw=round(peak_fc_mw, 2) if peak_fc_mw >= 0 else 0.0,
            peak_forecast_sp=peak_fc_sp,
            min_forecast_mw=round(min_fc_mw, 2) if min_fc_mw != float("inf") else 0.0,
            mae_mw=round(mae, 2) if mae is not None else None,
            rmse_mw=round(rmse, 2) if rmse is not None else None,
            wape_percent=round(wape, 2) if wape is not None else None,
            mean_bias_mw=round(mean_bias, 2) if mean_bias is not None else None,
            over_forecast_count=over_count,
            under_forecast_count=under_count,
            periods_without_forecast=periods_without_forecast,
            periods=periods,
        )


def get_forecast_revisions(target_start_time: str) -> ForecastConvergenceResponse:
    """
    Returns all published forecast revisions for a given target settlement hour/half-hour,
    demonstrating forecast evolution and convergence over time.
    """
    with get_db_connection() as conn:
        cur = conn.cursor()

        # Check actual
        cur.execute("SELECT generation, settlementPeriod FROM actuals WHERE startTime = ?", (target_start_time,))
        act_row = cur.fetchone()
        actual_val = float(act_row["generation"]) if act_row and act_row["generation"] is not None else None
        sp_num = act_row["settlementPeriod"] if act_row else 1

        # Search forecasts: if target is :30, check matching or nearest hour
        lookup_start = target_start_time
        if target_start_time.endswith(":30:00Z"):
            lookup_start = target_start_time.replace(":30:00Z", ":00:00Z")

        cur.execute(
            """
            SELECT publishTime, generation
            FROM forecasts
            WHERE startTime = ?
            ORDER BY publishTime ASC
        """,
            (lookup_start,),
        )

        rows = cur.fetchall()
        revisions: List[ForecastRevisionItem] = []
        for r in rows:
            lead = compute_lead_time_hours(r["publishTime"], target_start_time)
            revisions.append(
                ForecastRevisionItem(
                    publishTime=r["publishTime"],
                    leadTimeHours=lead,
                    generation=float(r["generation"]),
                )
            )

        return ForecastConvergenceResponse(
            targetStartTime=target_start_time,
            settlementPeriod=sp_num,
            actual_mw=actual_val,
            revisions=revisions,
        )
