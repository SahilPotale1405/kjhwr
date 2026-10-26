"""
Application Configuration
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DEFAULT_DB_PATH = os.path.join(DATA_DIR, "elexon_jan2026.db")

DATABASE_PATH = os.environ.get("DATABASE_PATH", DEFAULT_DB_PATH)

# GB Day-Ahead wholesale auction gate closure options (in UK local time on D-1)
# Note: These auction gate closure times must be verified against official EPEX SPOT and Nord Pool rulebooks.
CutoffKey = Literal["09:20", "09:50", "15:30"]

CUTOFF_OPTIONS = {
    "09:20": {
        "id": "09:20",
        "label": "09:20 (EPEX hourly GB)",
        "auction_name": "EPEX SPOT GB Day-Ahead Hourly Auction",
        "description": "EPEX SPOT GB Day-Ahead Hourly Auction gate closure",
        "time_str": "09:20",
        "hour": 9,
        "minute": 20,
    },
    "09:50": {
        "id": "09:50",
        "label": "09:50 (N2EX hourly)",
        "auction_name": "Nord Pool / N2EX Day-Ahead Hourly Auction",
        "description": "Nord Pool / N2EX Day-Ahead Hourly Auction gate closure",
        "time_str": "09:50",
        "hour": 9,
        "minute": 50,
    },
    "15:30": {
        "id": "15:30",
        "label": "15:30 (GB half-hourly auction)",
        "auction_name": "GB Day-Ahead Half-Hourly Auction",
        "description": "GB Day-Ahead Half-Hourly Auction gate closure",
        "time_str": "15:30",
        "hour": 15,
        "minute": 30,
    },
}

DEFAULT_DA_CUTOFF_KEY: CutoffKey = "09:20"

# Target delivery days: delivery days 1-31 Jan 2026
TARGET_DELIVERY_START_DATE = "2026-01-01"
TARGET_DELIVERY_END_DATE = "2026-01-31"


def get_scope_delivery_dates() -> list[str]:
    """
    Generates contiguous delivery dates (YYYY-MM-DD) from TARGET_DELIVERY_START_DATE
    to TARGET_DELIVERY_END_DATE (inclusive).
    Single source of truth across the application for date scope iteration.
    """
    start_dt = datetime.strptime(TARGET_DELIVERY_START_DATE, "%Y-%m-%d").date()
    end_dt = datetime.strptime(TARGET_DELIVERY_END_DATE, "%Y-%m-%d").date()
    dates = []
    curr = start_dt
    while curr <= end_dt:
        dates.append(curr.strftime("%Y-%m-%d"))
        curr += timedelta(days=1)
    return dates


def validate_delivery_date(date_str: str) -> str:
    """
    Validates delivery_date is YYYY-MM-DD and strictly within [TARGET_DELIVERY_START_DATE, TARGET_DELIVERY_END_DATE].
    Raises ValueError on invalid format or out-of-range date.
    """
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ValueError("Invalid delivery_date format. Expected YYYY-MM-DD.")

    start_dt = datetime.strptime(TARGET_DELIVERY_START_DATE, "%Y-%m-%d").date()
    end_dt = datetime.strptime(TARGET_DELIVERY_END_DATE, "%Y-%m-%d").date()
    if dt < start_dt or dt > end_dt:
        raise ValueError(
            f"delivery_date '{date_str}' is out of scope. Allowed delivery dates are {TARGET_DELIVERY_START_DATE} to {TARGET_DELIVERY_END_DATE}."
        )
    return date_str


def validate_start_time(start_time_str: str) -> str:
    """
    Validates start_time as an ISO 8601 timestamp whose delivery date falls strictly
    inside the configured scope (TARGET_DELIVERY_START_DATE to TARGET_DELIVERY_END_DATE).
    Raises ValueError with a clear message if invalid (triggers HTTP 422 in FastAPI).
    """
    if not isinstance(start_time_str, str):
        raise ValueError(f"Invalid start_time: expected string, got {type(start_time_str).__name__}")

    clean_str = start_time_str.strip()
    iso_candidate = clean_str[:-1] + "+00:00" if clean_str.endswith("Z") else clean_str
    try:
        dt = datetime.fromisoformat(iso_candidate)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid start_time format '{start_time_str}'. Expected valid ISO 8601 timestamp (e.g. 'YYYY-MM-DDTHH:MM:SSZ').")

    # Settlement period boundaries are half-hourly (:00 or :30)
    if dt.minute not in (0, 30) or dt.second != 0:
        raise ValueError(f"start_time '{start_time_str}' is not a valid 30-minute settlement period boundary (:00 or :30).")

    # Delivery date must be within configured scope
    date_str = dt.strftime("%Y-%m-%d")
    scope_dates = get_scope_delivery_dates()
    if date_str not in scope_dates:
        raise ValueError(
            f"start_time date '{date_str}' is outside configured evaluation scope "
            f"({TARGET_DELIVERY_START_DATE} to {TARGET_DELIVERY_END_DATE})."
        )

    return dt.strftime("%Y-%m-%dT%H:%M:00Z")


def compute_cutoff_datetime_utc(delivery_date_str: str, cutoff_key: str = DEFAULT_DA_CUTOFF_KEY) -> tuple[datetime, dict]:
    """
    Computes the exact UTC decision cutoff timestamp for a given delivery date (D)
    based on UK local time on Day D-1 using zoneinfo('Europe/London').
    Backend is the single source of truth for all cutoff definitions.
    Raises ValueError if cutoff_key is unknown (no silent fallback).
    """
    if cutoff_key not in CUTOFF_OPTIONS:
        raise ValueError(f"Unknown cutoff_time '{cutoff_key}'. Allowed options: {list(CUTOFF_OPTIONS.keys())}")

    # Validate delivery date format
    delivery_date = datetime.strptime(delivery_date_str, "%Y-%m-%d").date()
    opt = CUTOFF_OPTIONS[cutoff_key]
    decision_date_d_minus_1 = delivery_date - timedelta(days=1)

    # Local UK time on D-1
    tz_london = ZoneInfo("Europe/London")
    local_cutoff = datetime(
        year=decision_date_d_minus_1.year,
        month=decision_date_d_minus_1.month,
        day=decision_date_d_minus_1.day,
        hour=opt["hour"],
        minute=opt["minute"],
        second=0,
        tzinfo=tz_london,
    )

    # Convert to UTC (in January, GMT == UTC, but conversion is timezone-aware and robust)
    utc_cutoff = local_cutoff.astimezone(timezone.utc)
    return utc_cutoff, opt
