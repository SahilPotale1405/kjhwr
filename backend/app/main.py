"""
FastAPI Main Application
UK Renewable Energy Day-Ahead Wind Generation Forecasting & Accuracy Evaluation Portal
"""

import os
from typing import Optional, List
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import (
    DEFAULT_DA_CUTOFF_KEY,
    CUTOFF_OPTIONS,
    TARGET_DELIVERY_START_DATE,
    TARGET_DELIVERY_END_DATE,
    CutoffKey,
    validate_delivery_date,
    validate_start_time,
    get_scope_delivery_dates,
)
from .database import check_db_health
from .models import (
    DayAheadResponse,
    ForecastConvergenceResponse,
    OverallAnalytics,
    SettlementPeriodProfile,
    DailyPerformance,
    DistributionBin,
    ProcurementSimulationRequest,
    ProcurementSimulationResponse,
    WalkForwardCoverageResponse,
)
from .services.forecast_service import get_day_ahead_forecasts, get_forecast_revisions
from .services.analytics_service import (
    get_monthly_evaluation,
    get_settlement_period_profile,
    get_daily_performance,
    get_error_distribution,
)
from .services.simulation_service import simulate_procurement, get_walk_forward_coverage

app = FastAPI(
    title="UK Renewable Wind Procurement & Accuracy Analytics Portal",
    description="Product tailored for UK Energy Utilities buying wholesale power from the Day-Ahead Market. Provides latest Elexon BMRS wind forecasts, quantified accuracy evaluation, and thermal procurement decision simulation for January 2026.",
    version="1.0.0",
)

# Configure CORS: reads CORS_ORIGINS from env, defaults without '*'
# Browsers and W3C Fetch spec reject combining wildcard ('*') with allow_credentials=True
cors_origins_env = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000",
)
allowed_origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
has_wildcard = "*" in allowed_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=not has_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["System"])
def health():
    """Returns system health, database statistics, and connectivity status."""
    db_stat = check_db_health()
    return {
        "status": "online",
        "service": "UK Renewable Wind Procurement API",
        "eval_period": "January 2026",
        "database": db_stat,
    }


@app.get("/api/cutoffs", tags=["Day-Ahead Forecasting"])
def get_cutoffs():
    """Returns official GB Day-Ahead wholesale auction gate closure options (UK local time on D-1)."""
    return {
        "default": DEFAULT_DA_CUTOFF_KEY,
        "options": [
            {
                "id": opt["id"],
                "label": opt["label"],
                "description": opt["description"],
            }
            for opt in CUTOFF_OPTIONS.values()
        ],
    }


@app.get("/api/dates", tags=["Data"])
def get_available_dates():
    """Returns available delivery dates in January 2026 derived dynamically from the configured scope."""
    dates = get_scope_delivery_dates()
    return {
        "dates": dates,
        "min_date": TARGET_DELIVERY_START_DATE,
        "max_date": TARGET_DELIVERY_END_DATE,
        "default_date": "2026-01-15",
        "total_expected_sps": len(dates) * 48,
        "default_cutoff_time": DEFAULT_DA_CUTOFF_KEY,
        "cutoff_options": [
            {
                "id": opt["id"],
                "label": opt["label"],
                "description": opt["description"],
            }
            for opt in CUTOFF_OPTIONS.values()
        ],
    }


@app.get("/api/forecasts/day-ahead", response_model=DayAheadResponse, tags=["Day-Ahead Forecasting"])
def get_day_ahead(
    delivery_date: str = Query("2026-01-15", description="Target delivery date (YYYY-MM-DD) in January 2026"),
    cutoff_time: CutoffKey = Query(DEFAULT_DA_CUTOFF_KEY, description="Cutoff option key (09:20, 09:50, 15:30)"),
):
    """
    Retrieves the latest available wind generation forecast before gate closure / decision cutoff
    for all 48 settlement periods of the delivery day, alongside actuals and quantified errors.
    """
    try:
        validate_delivery_date(delivery_date)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return get_day_ahead_forecasts(delivery_date=delivery_date, cutoff_time=cutoff_time)


@app.get("/api/forecasts/convergence", response_model=ForecastConvergenceResponse, tags=["Day-Ahead Forecasting"])
def get_convergence(
    start_time: str = Query("2026-01-15T12:00:00Z", description="Target delivery half-hour UTC timestamp"),
):
    """
    Returns all forecast revisions published over time for a target delivery half-hour,
    illustrating forecast evolution, lead time decay, and convergence toward the actual.
    Validates start_time format (ISO 8601 half-hour timestamp) and scope, returning HTTP 422 if invalid.
    """
    try:
        valid_start_time = validate_start_time(start_time)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return get_forecast_revisions(valid_start_time)


@app.get("/api/analytics/overall", response_model=OverallAnalytics, tags=["Quantitative Accuracy"])
def get_overall(
    cutoff_time: CutoffKey = Query(DEFAULT_DA_CUTOFF_KEY, description="Cutoff option key (09:20, 09:50, 15:30)"),
):
    """
    Returns overall quantitative evaluation metrics across January 2026:
    MAE, RMSE, WAPE, Mean Bias, P10/P50/P90/P95 tail error, and total wind energy.
    """
    return get_monthly_evaluation(cutoff_time=cutoff_time)


@app.get("/api/analytics/settlement-period-profile", response_model=List[SettlementPeriodProfile], tags=["Quantitative Accuracy"])
def get_settlement_period_analysis(
    cutoff_time: CutoffKey = Query(DEFAULT_DA_CUTOFF_KEY, description="Cutoff option key (09:20, 09:50, 15:30)"),
):
    """
    Returns the diurnal error and generation profile across Settlement Periods 1-48,
    identifying peak uncertainty windows (e.g. morning ramp vs evening peak).
    """
    return get_settlement_period_profile(cutoff_time=cutoff_time)


@app.get("/api/analytics/daily", response_model=List[DailyPerformance], tags=["Quantitative Accuracy"])
def get_daily_metrics(
    cutoff_time: CutoffKey = Query(DEFAULT_DA_CUTOFF_KEY, description="Cutoff option key (09:20, 09:50, 15:30)"),
):
    """
    Returns day-by-day accuracy metrics for every single day in January 2026.
    """
    return get_daily_performance(cutoff_time=cutoff_time)


@app.get("/api/analytics/error-distribution", response_model=List[DistributionBin], tags=["Quantitative Accuracy"])
def get_distribution(
    cutoff_time: CutoffKey = Query(DEFAULT_DA_CUTOFF_KEY, description="Cutoff option key (09:20, 09:50, 15:30)"),
    bins: int = Query(14, ge=6, le=30, description="Number of histogram bins"),
):
    """
    Returns frequency distribution of forecast error (MW) for probability modeling and risk buffers.
    """
    return get_error_distribution(cutoff_time=cutoff_time, num_bins=bins)


@app.post("/api/procurement/simulate", response_model=ProcurementSimulationResponse, tags=["Procurement Simulation"])
def simulate(req: ProcurementSimulationRequest):
    """
    Simulates Day-Ahead power purchase decisions:
    Calculates net thermal procurement required beyond wind generation forecasts
    and sizes the recommended thermal peaking reserve buffer using empirical wind error quantiles.
    """
    return simulate_procurement(req)


@app.get("/api/procurement/coverage", response_model=WalkForwardCoverageResponse, tags=["Wind-Risk Hedge Simulation"])
def get_coverage(
    cutoff_time: CutoffKey = Query(DEFAULT_DA_CUTOFF_KEY, description="Cutoff option key (09:20, 09:50, 15:30)"),
    confidence_level: float = Query(0.90, ge=0.50, le=0.99, description="Target balancing confidence level"),
):
    """
    Evaluates out-of-sample walk-forward coverage of the pooled expanding buffer
    across all delivery days in the configured evaluation scope (from Day 2 onwards).
    For each day D, sizes the buffer strictly from days 1 to D-1 and measures error <= buffer.
    """
    return get_walk_forward_coverage(cutoff_time=cutoff_time, confidence_level=confidence_level)


# Static files / frontend serving if frontend is built into static directory
STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.exists(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        # Prevent directory traversal attacks using os.path.commonpath
        safe_path = os.path.abspath(os.path.join(STATIC_DIR, full_path))
        try:
            if os.path.commonpath([STATIC_DIR, safe_path]) != STATIC_DIR:
                raise HTTPException(status_code=403, detail="Access denied")
        except ValueError:
            # Different drives on Windows (e.g. C: vs D:) raise ValueError in commonpath
            raise HTTPException(status_code=403, detail="Access denied")

        if os.path.exists(safe_path) and os.path.isfile(safe_path):
            return FileResponse(safe_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
