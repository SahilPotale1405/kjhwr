# AeroProcure UK: Day-Ahead Renewable Wind Procurement & Accuracy Analytics

A full-stack web application designed for a UK wholesale electricity trading and procurement desk operating in the Great Britain (GB) Day-Ahead Market.

The portal enforces temporal causality on Day-Ahead auction gate closures, quantifies forecast accuracy against delivered actuals for wholesale purchase decisions across **January 2026** (1,488 half-hour settlement periods), and computes out-of-sample statistical reserve buffers to size firm renewable wind commitments.

---

## Strict Data Constraints & Disclosures

- **Exclusive Data Sources**: Sourced strictly from official **Elexon BMRS** endpoints for January 2026:
  - **Actuals**: `FUELHH` (`fuelType == "WIND"`, half-hour settlement periods 1–48)
  - **Forecasts**: `WINDFOR` (national wind generation forecasts with target timestamps and publish times)
- **Zero Lookahead Bias**: Enforces physical causality on Day D-1 wholesale auction gate closures. For any target period on delivery day D, only forecasts published at or before the decision cutoff on D-1 are eligible. Verified by automated tests in [`tests/test_forecast_selection.py`](tests/test_forecast_selection.py) and [`tests/test_reserve_buffer.py`](tests/test_reserve_buffer.py).
- **No Synthetic Demand or Price Assumptions**: The application uses **no demand, price, cost, or cashout data or claims anywhere** (code, UI, documentation). The simulator operates strictly as a **Wind-Risk Hedge Calculator** sizing firm wind volume from empirical out-of-sample forecast error distributions.

---

## Key Quantitative Benchmark Findings (January 1–31, 2026)

All figures below are computed strictly from the 1,488 half-hour Settlement Periods of January 2026 (31 delivery days × 48 SPs/day) using the default **09:20 UK local time cutoff on Day D-1** (verified by [`tests/test_reference_benchmarks.py`](tests/test_reference_benchmarks.py)):

| Metric | January 1–31, 2026 (1,488 SPs) | January 15, 2026 Benchmark (48 SPs) |
|---|---|---|
| **Mean Absolute Error (MAE)** | **2,127.82 MW** | **968.48 MW** |
| **Mean Bias Error (Signed)** | **+1,850.00 MW** (Systematic Over-forecast) | **+968.48 MW** (Systematic Over-forecast) |
| **Root Mean Squared Error (RMSE)** | **2,605.69 MW** | **1,107.26 MW** |
| **Weighted Absolute % Error (WAPE)** | **18.37%** | **9.16%** |
| **Directional Bias (% Over-forecast)** | **84.95%** of settlement periods | **100.0%** (48 / 48 periods) |
| **P90 Signed Error (Value-at-Risk)** | **4,315.10 MW** | — |
| **P95 Tail Risk Error** | **5,334.45 MW** | — |
| **Total Delivered Wind Generation** | **8,616.07 GWh** | **253.63 GWh** |
| **Total Forecast Wind Generation** | **9,992.47 GWh** | **276.87 GWh** |
| **Peak Forecast Generation** | **16,616 MW** (Jan 10, SP 40) | **15,834 MW** (SP 1, 00:00) |
| **Minimum Forecast Generation** | **1,529 MW** (Jan 20, SP 14) | **8,864 MW** (SP 33, 16:00) |
| **Out-of-Sample P90 Reserve Buffer** | — | **4,779.0 MW** (Pooled expanding window: Jan 1–14) |
| **Firm De-Risked Wind Volume** | — | **162.17 GWh** ($\text{Firm} = \max(0, \text{FC} - \text{Buffer})$) |
| **Firm Volume Delivery Reliability** | — | **100.0%** (Delivered actual $\ge$ Firm commitment) |

### Alternative Day-Ahead Auction Cutoffs (January 1–31, 2026)
- **09:50 Cutoff (N2EX Hourly)**: MAE = **2,107.75 MW**, Mean Bias = **+1,838.94 MW**
- **15:30 Cutoff (GB Half-Hourly)**: MAE = **1,966.45 MW**, Mean Bias = **+1,814.05 MW**

---

## Domain Methodology & Mathematical Formulation

### 1. Delivery Scope & Day D-1 Auction Timing
- **Scope**: January 1–31, 2026 (1,488 half-hour settlement periods).
- **Day-Ahead Mechanism**: Electricity delivery for Day D is traded and scheduled on Day D-1. Consequently, procurement decisions for January 1, 2026 take place on December 31, 2025.
- **First Delivery Day Constraint**: Because the dataset scope begins on January 1, 2026, there are no prior delivery days in January for Day 1. The out-of-sample reserve buffer returns `buffer_available=false` with an explanatory message rather than resorting to an ungrounded in-sample fallback.

### 2. Auction Cutoff Options & Market Deadlines
The backend enforces market gate closures strictly:
- **09:20 UK local time on D-1**: EPEX SPOT GB Day-Ahead Hourly Auction gate closure (Default). Order books close at 09:20 UK time / 10:20 CET.
- **09:50 UK local time on D-1**: Nord Pool N2EX GB Day-Ahead Hourly Auction gate closure. Order books close at 09:50 UK local time.
- **15:30 UK local time on D-1**: GB Day-Ahead Half-Hourly Auction gate closure (15:30 UK local time).
*(Note: Auction gate closure times can be cross-referenced against official EPEX SPOT and Nord Pool market rulebooks).*

### 3. Forecast Selection Rule
For each target settlement half-hour on delivery day D:
$$\text{Selected Forecast} = \arg\max_{\text{publishTime} \le \text{Cutoff}} \text{WINDFOR}(\text{startTime}, \text{publishTime})$$
- Forecasts published strictly after the cutoff are ineligible.
- Forecasts published exactly at the cutoff ($\text{publishTime} = \text{Cutoff}$) are eligible.
- If no eligible forecast exists before the cutoff, `forecast_mw` returns `None` (no silent `0.0` fallback), is excluded from accuracy metrics, and is counted in `periods_without_forecast`.

### 4. Hourly WINDFOR vs Half-Hourly FUELHH Reconciliation
- `FUELHH` actuals are published every 30 minutes (SPs 1–48).
- `WINDFOR` forecasts are published at hourly boundaries (`:00`).
- **Linear Interpolation Rule**: For half-hour periods (`:30`), the forecast is interpolated linearly between hour $H$ and hour $H+1$:
  $$\hat{F}_{H:30} = 0.5 \times F_{H:00} + 0.5 \times F_{H+1:00}$$
  If either hour is unavailable before the cutoff, the half-hour forecast is set to `None`.

### 5. Reserve Buffer Sizing & Out-of-Sample Walk-Forward
- **Definition**: Upward reserve buffer is sized using the empirical percentile of **signed forecast errors** ($\text{signed\_error} = \text{forecast} - \text{actual}$):
  $$\text{Reserve Buffer}(D) = \text{percentile}\left(\{\text{signed\_errors}_t\}_{t \in \text{Days} < D}, \text{confidence} \times 100\right)$$
  *Reasoning*: An electricity buyer requires upward reserve replacement only when wind under-delivers ($\text{actual} < \text{forecast}$, leaving the portfolio short). When $\text{actual} > \text{forecast}$, the portfolio is long, which does not trigger upward reserve procurement.
- **Pooled Expanding Window**: To eliminate lookahead bias, the buffer for delivery day $D$ is fitted over ALL settlement periods of ALL delivery days strictly prior to day $D$ ($1 \dots D-1$).
- **Walk-Forward Coverage**: Across January 2–31, 2026 (1,440 settlement periods over 30 delivery days), this expanding window achieves **89.86% (~89.9%)** empirical coverage at a 90% confidence target. Worst single-day coverage occurs on 2026-01-28 (0.0%), where rapid weather regime shifts caused persistent under-forecasts relative to actual output.

### 6. Firm Renewable Wind Sizing
Quantifies the de-risked renewable energy volume available for Day-Ahead commitments:
$$\text{Firm Wind}(t) = \max\left(0, \text{Forecast}(t) - \text{Buffer}(t)\right)$$

---

## Bias Investigation Findings (`scripts/bias_by_lead_time.py`)

A lead-time decomposition of all 18,104 WINDFOR revisions targeting January 2026 revealed:

| Lead Time Horizon | Count | Mean Bias (MW) | MAE (MW) | Over-Forecast % |
|---|---|---|---|---|
| **0–6h (Intraday Real-Time)** | 1,488 | **+1,548.2 MW** | 1,767.7 MW | 86.5% |
| **6–12h (Near-Term)** | 1,488 | **+1,616.1 MW** | 1,833.7 MW | 87.0% |
| **12–18h (Evening Prior / Morning DA)** | 1,488 | **+1,739.9 MW** | 1,932.8 MW | 87.4% |
| **18–24h (Standard Day-Ahead D-1)** | 1,488 | **+1,882.5 MW** | 2,048.9 MW | 89.2% |
| **24–36h (Day-Ahead Late Window)** | 2,976 | **+1,838.5 MW** | 2,122.6 MW | 85.2% |
| **36–48h (Two-Day-Ahead Horizon)** | 2,945 | **+2,004.5 MW** | 2,337.0 MW | 85.1% |
| **48–72h (Medium-Range)** | 2,510 | **+1,479.6 MW** | 2,371.9 MW | 76.0% |

> **Key Finding**: Systematic over-forecasting persists even at short 1–3h lead times (~+1,600 MW), demonstrating that the bias is predominantly a constant **level offset** rather than a consequence of lead-time uncertainty decay.
>
> **Unconfirmed Cause**: The root cause is NOT confirmed. One plausible hypothesis is a structural scope mismatch between `WINDFOR` (which models total national wind capacity, potentially including embedded/distributed generation) and `FUELHH WIND` (which measures transmission-system-connected metered generation). This hypothesis should be investigated further against official Elexon BSC and National Grid ESO documentation.

---

## Architecture & Design Decisions

### Data Flow
```
Elexon BMRS API (FUELHH & WINDFOR)
                │
                ▼ (Batch Ingestion via scripts/download_data.py)
SQLite Database (backend/app/data/elexon_jan2026.db)
                │
                ▼ (SQLAlchemy / Raw SQL indexed queries)
FastAPI Service Layer
  ├── forecast_service.py   (Cutoff filtering, latest publish selection, interpolation)
  ├── analytics_service.py  (MAE, RMSE, WAPE, Bias, empirical percentiles)
  └── simulation_service.py (Pooled expanding reserve buffer, firm wind sizing, walk-forward coverage)
                │
                ▼ (REST API / Pydantic validation)
React + Vite Frontend (Tailwind CSS, Lucide Icons, Recharts)
  ├── DayAheadCockpit.jsx          (Forecast vs actual profiles, 48-SP error matrix)
  ├── AccuracyAnalytics.jsx        (Monthly error distribution, diurnal profiles)
  ├── ThermalProcurementSimulator.jsx (Wind-risk hedge calculator, out-of-sample coverage)
  ├── ForecastConvergence.jsx      (Multi-revision lead-time convergence curves)
  └── RawDataViewer.jsx            (Audit ledger & CSV export)
```

### Key Engineering Decisions
1. **Pre-Ingested SQLite Database**:
   - Eliminates runtime dependency on external Elexon BMRS API rate limits, network latency, or service interruptions during trading reviews.
   - Provides deterministic, reproducible evaluations across all 1,488 settlement periods.
   - Indexed on `(delivery_date, settlement_period)` for actuals and `(start_time, publish_time)` for forecasts to ensure fast queries without needing an external caching layer.
2. **Strict Single-Source Domain Boundaries**:
   - Date ranges and auction cutoffs are defined exclusively in `backend/app/config.py` and served via `/api/dates` and `/api/cutoffs`. The frontend derives date pickers and dropdowns dynamically from these endpoints.
3. **Robust Client-Side Data Fetching**:
   - All frontend fetch hooks utilize `AbortController` signals to cancel inflight requests when users switch cutoffs or dates rapidly, preventing out-of-order race conditions.
   - The confidence level control is debounced (300 ms) to prevent API thrashing.
   - Error states include retry actions directly in the UI.
4. **Comprehensive Automated Test Strategy**:
   - 31 unit and integration tests across 4 test modules verify forecast selection rules, timestamp validation, directory traversal prevention, out-of-sample buffer mechanics, walk-forward coverage, and exact benchmark reproduction.

---

## Directory Layout

```
.
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI application, routes, error handlers & static mount
│   │   ├── config.py                   # Market cutoffs, date scope constants & date validation helpers
│   │   ├── database.py                 # SQLite connection manager & scoped health checks
│   │   ├── models.py                   # Pydantic schemas (DayAheadResponse, WindHedge, etc.)
│   │   ├── services/
│   │   │   ├── forecast_service.py     # Causal forecast selection & linear interpolation logic
│   │   │   ├── analytics_service.py    # MAE, RMSE, WAPE, Bias, and empirical percentile metrics
│   │   │   └── simulation_service.py   # Pooled expanding window hedge calculator & coverage
│   │   └── data/
│   │       └── elexon_jan2026.db       # SQLite database (1,488 actuals, 18,104 forecast revisions)
│   ├── requirements.txt                # Python backend production dependencies
│   └── requirements-dev.txt            # Python development & testing dependencies (pytest)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx              # Header, dynamic SP counter, navigation tabs
│   │   │   ├── DayAheadCockpit.jsx     # Forecast curves, dynamic date picker, 48-SP error matrix
│   │   │   ├── AccuracyAnalytics.jsx   # MAE, RMSE, WAPE, Diurnal profile, error distribution
│   │   │   ├── ThermalProcurementSimulator.jsx # Wind-Risk Hedge Calculator (Firm wind & buffer)
│   │   │   ├── ForecastConvergence.jsx # Lead-time convergence curve with lead time calculations
│   │   │   ├── RawDataViewer.jsx       # Audit ledger & CSV download
│   │   │   └── MetricCard.jsx          # Reusable KPI card with trend & status indicators
│   │   ├── utils/
│   │   │   └── thresholds.js           # Unified WAPE and bias classification badges
│   │   ├── services/
│   │   │   └── api.js                  # API client with AbortController signal support
│   │   └── App.jsx                     # Root application container & error handling
│   ├── package.json
│   └── vite.config.js
├── tests/
│   ├── test_forecast_selection.py      # Selection rules, cutoffs, missing forecast handling, interpolation
│   ├── test_api_validation.py          # 422 validations, ISO timestamps, date scope boundaries
│   ├── test_backend_hardening.py       # Traversal prevention, exception handling, WAPE denominator
│   ├── test_reserve_buffer.py          # Out-of-sample expanding window, walk-forward coverage
│   └── test_reference_benchmarks.py    # Reference metric reproduction for 09:20, 09:50, 15:30, Jan 15
├── scripts/
│   ├── bias_by_lead_time.py            # Lead-time bias investigation script
│   ├── verify_pipeline.py              # Automated 11-step backend pipeline verification suite
│   └── download_data.py                # Idempotent Elexon BMRS API batch ingestion script
├── Dockerfile                          # Multi-stage production container build
├── docker-compose.yml                  # Docker Compose runner
├── vercel.json                         # Vercel deployment configuration
├── pytest.ini                          # Pytest configuration
└── README.md
```

---

## How to Start & Run the Application

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ and npm
- (Optional) Docker and Docker Compose

### 2. Local Development

#### Backend Setup:
```bash
# 1. Install dependencies
pip install -r backend/requirements.txt -r backend/requirements-dev.txt

# 2. Run backend server
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
- API Base: `http://127.0.0.1:8000`
- Interactive OpenAPI Docs (Swagger UI): `http://127.0.0.1:8000/docs`

#### Frontend Setup:
```bash
# 1. Install npm dependencies
cd frontend
npm install

# 2. Start Vite development server
npm run dev
```
- Frontend UI: `http://localhost:5173`

---

## How to Run Automated Tests

### Run Pytest Locally
```bash
# Run the complete test suite (31 tests)
pytest -v
```

All 31 tests cover:
- `test_forecast_selection.py`: Causal cutoff eligibility, latest revision selection, `:30` interpolation, missing forecast handling.
- `test_api_validation.py`: HTTP 422 on invalid cutoffs, out-of-scope dates, malformed ISO timestamps, non-half-hour boundaries.
- `test_backend_hardening.py`: Directory traversal prevention, specific error handling, WAPE denominator exclusion.
- `test_reserve_buffer.py`: Out-of-sample expanding buffer sizing, Day 1 buffer unavailable state, walk-forward coverage validation.
- `test_reference_benchmarks.py`: Exact reproduction of 09:20 reference metrics, 15 Jan benchmarks, and 09:50 / 15:30 cutoffs.

### Run Tests via Docker
```bash
docker compose run backend pytest -v
```

---

## How to Rebuild the Database

The SQLite database (`backend/app/data/elexon_jan2026.db`) can be re-ingested directly from official Elexon BMRS APIs using the idempotent ingestion script:
```bash
python scripts/download_data.py
```
This fetches:
1. `FUELHH` half-hourly actual wind generation records (`fuelType=WIND`) for January 1–31, 2026 (1,488 settlement periods).
2. `WINDFOR` forecast revisions published between December 28, 2025 and January 31, 2026 targeting January 2026 settlement periods (18,104 records).

---

## Live Deployment

- **Deployed Application URL**: [https://uk-wind-procurement-analytics-bay.vercel.app](https://uk-wind-procurement-analytics-bay.vercel.app)
- **Interactive OpenAPI Docs**: [https://uk-wind-procurement-analytics-bay.vercel.app/docs](https://uk-wind-procurement-analytics-bay.vercel.app/docs)

---

## AI-Use Disclosure

In accordance with the assignment guidelines, this application was developed with the assistance of agentic AI coding tools.

### Tools Used
- **Agentic AI Coding Assistant**: Google Antigravity / Gemini 2.5
- **Development Environment**: Antigravity IDE & PowerShell
- **Runtime & Toolchain**: Python 3.12 (FastAPI, NumPy, Uvicorn, Pytest), Node.js 22 (React, Vite, Recharts, Tailwind CSS)

### How AI Was Utilized
- **Domain Modeling & Edge-Case Guardrails**: Accelerated formulation of strict D-1 market cutoff causality rules (`publishTime <= cutoff_time`) and hourly-to-half-hour linear interpolation for settlement periods.
- **Statistical Analytics & Walk-Forward Optimization**: Guided migration from a simple static buffer to a mathematically sound out-of-sample expanding window ($1 \dots D-1$), improving walk-forward coverage from 81% to 89.86% over January 2–31.
- **Automated Verification**: Generated a comprehensive 31-test pytest suite validating exact benchmark reproducibility (MAE 2,127.82 MW, Mean Bias +1,850.00 MW, 89.86% coverage, and Day 15 benchmark figures).
- **Frontend Polish & Component Architecture**: Structured modern Recharts components (ComposedChart with dual forecast/actual curves, diurnal bands, revision convergence).

### Human Verification & Quality Assurance
- **Data Integrity Audit**: Manually audited all code and UI to guarantee strict compliance with data constraints (zero synthetic demand, price, cost, or cashout claims; 100% Elexon FUELHH and WINDFOR data).
- **Mathematical Hand-Verification**: Hand-checked settlement periods (e.g. 15 Jan SP 25 12:00 UTC trace identifying the used run published at 07:30 UTC with forecast 11,049 MW, actual 9,742 MW, error +1,307 MW).
- **Execution & Deployment Verification**: Verified that all 31 unit tests pass locally and in container environments, and verified the production build and live endpoints on Vercel.
