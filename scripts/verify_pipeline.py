"""
Pipeline and API Verification Script
Tests all core functions and API endpoints of the backend application.
"""

import sys
import os

# Add root directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from backend.app.main import app

def run_tests():
    print("==================================================")
    print("1. Initializing TestClient...")
    client = TestClient(app)

    print("==================================================")
    print("2. Testing /api/health...")
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    health_data = res.json()
    print("Health Status:", health_data["status"])
    print("Actuals count:", health_data["database"]["actuals_count"])
    print("Forecasts count:", health_data["database"]["forecasts_count"])

    print("==================================================")
    print("3. Testing /api/dates...")
    res = client.get("/api/dates")
    assert res.status_code == 200
    dates_data = res.json()
    print("Available dates:", len(dates_data["dates"]), "dates")
    print("First date:", dates_data["dates"][0], "Last date:", dates_data["dates"][-1])

    print("==================================================")
    print("4. Testing /api/forecasts/day-ahead (Delivery Date: 2026-01-15, Cutoff: 09:20)...")
    res = client.get("/api/forecasts/day-ahead?delivery_date=2026-01-15&cutoff_time=09:20")
    assert res.status_code == 200
    da = res.json()
    print("Periods returned:", len(da["periods"]))
    print(f"Total Forecast MWh: {da['total_forecast_mwh']}")
    print(f"Total Actual MWh:   {da['total_actual_mwh']}")
    print(f"MAE:                {da['mae_mw']} MW")
    print(f"RMSE:               {da['rmse_mw']} MW")
    print(f"Mean Bias:          {da['mean_bias_mw']} MW")
    print(f"WAPE:               {da['wape_percent']}%")
    print(f"Over forecast SPs:  {da['over_forecast_count']} / 48")

    print("==================================================")
    print("5. Testing /api/analytics/overall...")
    res = client.get("/api/analytics/overall?cutoff_time=09:20")
    assert res.status_code == 200
    ov = res.json()
    print("Evaluated Month:", ov["eval_month"])
    print("Total Evaluated SPs:", ov["total_evaluated_points"])
    print("Month MAE:", ov["mae_mw"], "MW")
    print("Month RMSE:", ov["rmse_mw"], "MW")
    print("Month WAPE:", ov["wape_percent"], "%")
    print("Month Mean Bias:", ov["mean_bias_mw"], "MW")
    print("P90 Error:", ov["p90_error_mw"], "MW")
    print("P95 Error:", ov["p95_error_mw"], "MW")
    print(f"Directional: Over {ov['pct_over_forecast']}% vs Under {ov['pct_under_forecast']}%")

    print("==================================================")
    print("6. Testing /api/analytics/settlement-period-profile...")
    res = client.get("/api/analytics/settlement-period-profile?cutoff_time=09:20")
    assert res.status_code == 200
    prof = res.json()
    print("Diurnal profile returned periods:", len(prof))
    print("Sample SP 1:", prof[0])
    print("Sample SP 24:", prof[23])
    print("Sample SP 36 (Evening Peak):", prof[35])

    print("==================================================")
    print("7. Testing /api/analytics/daily...")
    res = client.get("/api/analytics/daily?cutoff_time=09:20")
    assert res.status_code == 200
    daily = res.json()
    print("Daily items returned:", len(daily))
    print("Day 1:", daily[0])
    print("Day 31:", daily[-1])

    print("==================================================")
    print("8. Testing /api/analytics/error-distribution...")
    res = client.get("/api/analytics/error-distribution?cutoff_time=09:20&bins=14")
    assert res.status_code == 200
    dist = res.json()
    print("Distribution bins count:", len(dist))
    for b in dist[:4]:
        print(f"  {b['bin_label']}: count={b['count']}, pct={b['percentage']}%")

    print("==================================================")
    print("9. Testing /api/procurement/simulate (Wind-Risk Hedge Calculator)...")
    payload = {
        "delivery_date": "2026-01-15",
        "cutoff_time": "09:20",
        "confidence_level": 0.90
    }
    res = client.post("/api/procurement/simulate", json=payload)
    assert res.status_code == 200
    sim = res.json()
    print("Delivery Date:", sim["delivery_date"])
    print("Recommended Reserve Buffer:", sim["recommended_reserve_buffer_mw"], "MW")
    print("Total Forecast Wind:", sim["total_forecast_wind_mwh"], "MWh")
    print("Total Firm Wind:", sim["total_firm_wind_mwh"], "MWh")
    print("Firm Commitment Reliability:", sim["firm_reliability_percent"], "%")
    print("Sample Window:", sim["buffer_sample_window"])

    print("==================================================")
    print("10. Testing /api/forecasts/convergence...")
    res = client.get("/api/forecasts/convergence?start_time=2026-01-15T12:00:00Z")
    assert res.status_code == 200
    conv = res.json()
    print(f"Target: {conv['targetStartTime']}, Actual: {conv['actual_mw']} MW, Revisions count: {len(conv['revisions'])}")

    print("==================================================")
    print("11. Testing Validation: Invalid cutoff and date reject with HTTP 422...")
    res_bad_cutoff = client.get("/api/forecasts/day-ahead?delivery_date=2026-01-15&cutoff_time=invalid_time")
    assert res_bad_cutoff.status_code == 422, f"Expected 422 for invalid cutoff, got {res_bad_cutoff.status_code}"
    print("Invalid cutoff rejected with HTTP 422: OK")

    res_bad_date = client.get("/api/forecasts/day-ahead?delivery_date=2026-02-15&cutoff_time=09:20")
    assert res_bad_date.status_code == 422, f"Expected 422 for out-of-scope date, got {res_bad_date.status_code}"
    print("Out-of-scope date rejected with HTTP 422: OK")

    print("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<")

if __name__ == "__main__":
    run_tests()
