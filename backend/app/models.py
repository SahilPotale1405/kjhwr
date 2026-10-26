"""
Pydantic Data Models & Response Schemas
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator
from .config import CutoffKey, validate_delivery_date


class PeriodPoint(BaseModel):
    startTime: str
    settlementPeriod: int
    actual_mw: Optional[float] = None
    forecast_mw: Optional[float] = None
    forecast_publish_time: Optional[str] = None
    lead_time_hours: Optional[float] = None
    error_mw: Optional[float] = None
    abs_error_mw: Optional[float] = None
    pct_error: Optional[float] = None


class DayAheadResponse(BaseModel):
    delivery_date: str
    decision_cutoff_utc: str
    decision_time_used: str
    cutoff_time: str = ""
    cutoff_label: str
    available_cutoffs: List[Dict[str, str]]
    total_actual_mwh: Optional[float] = None
    total_forecast_mwh: float
    peak_forecast_mw: float
    peak_forecast_sp: int
    min_forecast_mw: float
    mae_mw: Optional[float] = None
    rmse_mw: Optional[float] = None
    wape_percent: Optional[float] = None
    mean_bias_mw: Optional[float] = None
    over_forecast_count: int
    under_forecast_count: int
    periods_without_forecast: int = 0
    periods: List[PeriodPoint]


class ForecastRevisionItem(BaseModel):
    publishTime: str
    leadTimeHours: float
    generation: float


class ForecastConvergenceResponse(BaseModel):
    targetStartTime: str
    settlementPeriod: int
    actual_mw: Optional[float]
    revisions: List[ForecastRevisionItem]


class OverallAnalytics(BaseModel):
    eval_month: str
    decision_cutoff_rule: str
    total_evaluated_points: int
    mae_mw: float
    rmse_mw: float
    wape_percent: float
    mean_bias_mw: float
    p10_error_mw: float
    p50_error_mw: float
    p90_error_mw: float
    p95_error_mw: float
    max_over_forecast_mw: float
    max_under_forecast_mw: float
    pct_over_forecast: float
    pct_under_forecast: float
    total_actual_wind_gwh: float
    total_forecast_wind_gwh: float
    # Empirical lead-time bias decomposition across all January 2026 forecast revisions
    lead_bias_0_6h_mw: Optional[float] = None
    lead_bias_18_24h_mw: Optional[float] = None


class SettlementPeriodProfile(BaseModel):
    settlementPeriod: int
    time_label: str
    avg_actual_mw: float
    avg_forecast_mw: float
    mae_mw: float
    mean_bias_mw: float
    p90_error_mw: float


class DailyPerformance(BaseModel):
    date: str
    avg_actual_mw: float
    avg_forecast_mw: float
    total_actual_gwh: float
    total_forecast_gwh: float
    mae_mw: float
    rmse_mw: float
    wape_percent: float
    mean_bias_mw: float


class DistributionBin(BaseModel):
    bin_min: float
    bin_max: float
    bin_label: str
    count: int
    percentage: float


class WindHedgeSimulationRequest(BaseModel):
    delivery_date: str = "2026-01-15"
    cutoff_time: CutoffKey = "09:20"
    confidence_level: float = Field(default=0.90, description="Balancing safety confidence level (0.80, 0.90, 0.95)")

    @field_validator("delivery_date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        return validate_delivery_date(v)


class WindHedgeSimulationResponse(BaseModel):
    delivery_date: str
    cutoff_time: str
    confidence_level: float
    buffer_available: bool = True
    message: Optional[str] = None
    recommended_reserve_buffer_mw: Optional[float] = None
    total_forecast_wind_mwh: float
    total_firm_wind_mwh: Optional[float] = None
    total_actual_wind_mwh: Optional[float] = None
    firm_reliability_percent: Optional[float] = None
    buffer_sample_window: Optional[str] = None
    periods: List[Dict[str, Any]]


class WorstDayCoverageItem(BaseModel):
    date: str
    coverage_percent: float
    buffer_mw: float
    min_error_mw: float
    max_error_mw: float
    covered_periods: int
    total_periods: int


class WalkForwardCoverageResponse(BaseModel):
    cutoff_time: str
    confidence_level: float
    target_coverage_percent: float
    achieved_coverage_percent: float
    total_evaluated_periods: int
    total_covered_periods: int
    evaluated_days_count: int
    worst_day_date: str
    worst_day_coverage_percent: float
    evaluation_window: str = "2026-01-02 to 2026-01-31 (expanding prior days)"
    worst_days: List[WorstDayCoverageItem] = []


# Aliases for backward compatibility
ProcurementSimulationRequest = WindHedgeSimulationRequest
ProcurementSimulationResponse = WindHedgeSimulationResponse
