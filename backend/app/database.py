"""
Database Access Layer
Provides fast, indexed SQLite access to FUELHH actuals and WINDFOR forecasts.
"""

import sqlite3
import os
from contextlib import contextmanager
from .config import DATABASE_PATH, TARGET_DELIVERY_START_DATE, TARGET_DELIVERY_END_DATE


@contextmanager
def get_db_connection():
    if not os.path.exists(DATABASE_PATH):
        raise FileNotFoundError(f"Database file not found at: {DATABASE_PATH}")
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def check_db_health():
    with get_db_connection() as conn:
        cur = conn.cursor()
        # Count actuals within the configured evaluation scope (1-31 Jan 2026: 1,488 SPs)
        cur.execute(
            "SELECT COUNT(*) FROM actuals WHERE settlementDate >= ? AND settlementDate <= ?",
            (TARGET_DELIVERY_START_DATE, TARGET_DELIVERY_END_DATE),
        )
        act_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM actuals")
        raw_act_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM forecasts")
        fc_count = cur.fetchone()[0]
        return {
            "status": "healthy",
            "actuals_count": act_count,
            "raw_actuals_count": raw_act_count,
            "forecasts_count": fc_count,
            "scope_start": TARGET_DELIVERY_START_DATE,
            "scope_end": TARGET_DELIVERY_END_DATE,
            "database_path": DATABASE_PATH,
        }
