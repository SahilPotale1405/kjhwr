"""
Elexon BMRS Data Ingestion Script
Fetches actual wind generation (FUELHH) and wind forecasts (WINDFOR)
specifically for purchase decisions to be made in January 2026.
"""

import os
import sys
import time
import json
import sqlite3
import urllib.request
from datetime import datetime, timedelta

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "backend", "app", "data")
DB_PATH = os.path.join(DATA_DIR, "elexon_jan2026.db")

ELEXON_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"


def init_db(db_path=DB_PATH):
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS actuals (
        startTime TEXT PRIMARY KEY,
        settlementDate TEXT,
        settlementPeriod INTEGER,
        publishTime TEXT,
        generation REAL,
        UNIQUE(settlementDate, settlementPeriod)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS forecasts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        publishTime TEXT,
        startTime TEXT,
        generation REAL,
        UNIQUE(publishTime, startTime)
    )
    """)

    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_fc_pub_start ON forecasts(publishTime, startTime)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fc_start ON forecasts(startTime)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fc_pub ON forecasts(publishTime)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_act_date ON actuals(settlementDate)")
    conn.commit()
    return conn


def fetch_json(url, max_retries=3, delay=1.0):
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "UK-Renewable-Procurement-App/1.0",
        },
    )
    for attempt in range(max_retries):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            time.sleep(delay * (attempt + 1))


def ingest_fuelhh_actuals(conn, start_iso="2026-01-01T00:00:00Z", end_iso="2026-02-02T00:00:00Z"):
    print(f"--> Ingesting FUELHH (Actuals) from {start_iso} to {end_iso}...")
    start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end_dt = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    curr = start_dt
    total_wind = 0
    cur = conn.cursor()

    while curr < end_dt:
        nxt = min(curr + timedelta(days=5), end_dt)
        s_str = curr.strftime("%Y-%m-%dT%H:%M:%SZ")
        e_str = nxt.strftime("%Y-%m-%dT%H:%M:%SZ")
        url = f"{ELEXON_BASE_URL}/FUELHH/stream?publishDateTimeFrom={s_str}&publishDateTimeTo={e_str}"
        print(f"  Fetching FUELHH [{s_str} -> {e_str}]...")
        data = fetch_json(url)
        wind_records = [d for d in data if d.get("fuelType") == "WIND"]
        for d in wind_records:
            cur.execute("""
                INSERT OR IGNORE INTO actuals (startTime, settlementDate, settlementPeriod, publishTime, generation)
                VALUES (?, ?, ?, ?, ?)
            """, (d["startTime"], d.get("settlementDate"), d.get("settlementPeriod"), d.get("publishTime"), d.get("generation")))
        conn.commit()
        total_wind += len(wind_records)
        curr = nxt
        time.sleep(0.3)

    print(f"FUELHH Ingestion Complete. Total wind actual records stored: {total_wind}")


def ingest_windfor_forecasts(conn, start_iso="2025-12-30T00:00:00Z", end_iso="2026-02-02T00:00:00Z"):
    print(f"--> Ingesting WINDFOR (Forecasts) published from {start_iso} to {end_iso}...")
    start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
    end_dt = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
    curr = start_dt
    total_forecasts = 0
    cur = conn.cursor()

    while curr < end_dt:
        nxt = min(curr + timedelta(days=4), end_dt)
        s_str = curr.strftime("%Y-%m-%dT%H:%M:%SZ")
        e_str = nxt.strftime("%Y-%m-%dT%H:%M:%SZ")
        url = f"{ELEXON_BASE_URL}/WINDFOR/stream?publishDateTimeFrom={s_str}&publishDateTimeTo={e_str}"
        print(f"  Fetching WINDFOR [{s_str} -> {e_str}]...")
        data = fetch_json(url)
        for d in data:
            cur.execute("""
                INSERT OR IGNORE INTO forecasts (publishTime, startTime, generation)
                VALUES (?, ?, ?)
            """, (d["publishTime"], d["startTime"], d.get("generation")))
        conn.commit()
        total_forecasts += len(data)
        curr = nxt
        time.sleep(0.3)

    print(f"WINDFOR Ingestion Complete. Total forecast records stored: {total_forecasts}")


if __name__ == "__main__":
    conn = init_db()
    ingest_fuelhh_actuals(conn)
    ingest_windfor_forecasts(conn)
    conn.close()
    print("All Elexon January 2026 data successfully ingested.")
