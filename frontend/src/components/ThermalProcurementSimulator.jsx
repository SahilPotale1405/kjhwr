import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ShieldCheck, Wind, Sliders, CheckCircle2, AlertCircle, Info, RefreshCw, Calendar } from 'lucide-react';
import MetricCard from './MetricCard';
import { api } from '../services/api';

export default function ThermalProcurementSimulator({
  selectedDate,
  setSelectedDate = null,
  minDate = "2026-01-01",
  maxDate = "2026-01-31",
  cutoffTime,
}) {
  const [confidenceLevel, setConfidenceLevel] = useState(0.90);
  const [debouncedConfidence, setDebouncedConfidence] = useState(0.90);
  const [simData, setSimData] = useState(null);
  const [coverageData, setCoverageData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  // Debounce confidence changes (300ms) to avoid hammering backend
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedConfidence(confidenceLevel);
    }, 300);
    return () => clearTimeout(handler);
  }, [confidenceLevel]);

  useEffect(() => {
    const controller = new AbortController();
    const runSimulation = async () => {
      setLoading(true);
      setError(null);
      try {
        const [resSim, resCov] = await Promise.all([
          api.simulateProcurement({
            delivery_date: selectedDate,
            cutoff_time: cutoffTime,
            confidence_level: parseFloat(debouncedConfidence),
          }, { signal: controller.signal }),
          api.getWalkForwardCoverage(cutoffTime, parseFloat(debouncedConfidence), { signal: controller.signal }),
        ]);
        setSimData(resSim);
        setCoverageData(resCov);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Simulation error:', err);
        setError('Failed to compute hedge simulation metrics. Please verify backend connection.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    runSimulation();
    return () => controller.abort();
  }, [selectedDate, cutoffTime, debouncedConfidence, retryKey]);

  if (loading && !simData) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-4"></div>
        <p className="text-slate-400 font-mono text-sm">Calculating De-Risked Wind Volume & Reserve Buffers...</p>
      </div>
    );
  }

  if (error && !simData) {
    return (
      <div className="p-8 rounded-2xl bg-rose-950/20 border border-rose-800/60 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
        <h3 className="text-base font-bold text-white">Hedge Simulation Calculation Failed</h3>
        <p className="text-xs text-rose-300 max-w-md mx-auto">{error}</p>
        <button
          onClick={() => setRetryKey((k) => k + 1)}
          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Simulation</span>
        </button>
      </div>
    );
  }

  if (!simData) {
    return (
      <div className="py-24 text-center p-8 rounded-2xl bg-slate-900/40 border border-slate-800">
        <Info className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-slate-400 font-mono text-sm">No hedge simulation data available for {selectedDate}.</p>
      </div>
    );
  }

  // Format chart data for pure wind hedging
  const chartData = simData.periods.map((p) => {
    const timeShort = p.startTime.substring(11, 16);
    return {
      sp: p.settlementPeriod,
      time: timeShort,
      windForecast: p.wind_forecast_mw,
      firmWind: p.firm_wind_mw,
      reserveBuffer: p.reserve_buffer_mw,
      windActual: p.wind_actual_mw,
      deficit: p.deficit_mw,
      satisfied: p.firm_satisfied,
    };
  });

  const totalForecastGWh = (simData.total_forecast_wind_mwh / 1000).toFixed(1);
  const totalFirmGWh = simData.total_firm_wind_mwh !== null && simData.total_firm_wind_mwh !== undefined
    ? (simData.total_firm_wind_mwh / 1000).toFixed(1)
    : 'N/A';
  const totalActualGWh = simData.total_actual_wind_mwh !== null && simData.total_actual_wind_mwh !== undefined
    ? (simData.total_actual_wind_mwh / 1000).toFixed(1)
    : 'N/A';
  const reserveBufferDisplay = simData.recommended_reserve_buffer_mw !== null && simData.recommended_reserve_buffer_mw !== undefined
    ? Math.round(simData.recommended_reserve_buffer_mw).toLocaleString()
    : 'N/A';

  const coveredCount = (simData.periods || []).filter((p) => p.firm_satisfied === true).length;
  const totalCount = (simData.periods || []).filter((p) => p.firm_satisfied !== null).length || (simData.periods || []).length;

  return (
    <div className="space-y-6">
      {/* Non-blocking error banner if update failed but previous data is retained */}
      {error && simData && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center gap-1 transition"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Simulation Controls Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800/80 border border-slate-800 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-mono font-medium">
                Day-Ahead Wind Risk Hedge
              </span>
              <span className="text-xs text-slate-400 font-mono">Date: {selectedDate}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white mt-1">
              Wind-Risk Hedge Calculator
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Sizes empirical upward balancing buffers and quantifies firm, de-risked wind volume: <strong className="text-slate-300 font-mono">Firm Wind = max(0, Forecast - Buffer)</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Delivery Date Picker */}
            {setSelectedDate && (
              <div className="flex items-center space-x-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-slate-400 font-medium">Delivery Date:</span>
                <input
                  type="date"
                  min={minDate}
                  max={maxDate}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            )}

            {/* Confidence Level Selector */}
            <div className="flex items-center gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 self-start lg:self-auto">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-xs text-slate-400 block font-medium">Confidence Level (VaR):</span>
                <select
                  value={confidenceLevel}
                  onChange={(e) => setConfidenceLevel(Number(e.target.value))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 mt-1"
                >
                  <option value={0.80}>80% Confidence (Aggressive)</option>
                  <option value={0.90}>90% Confidence (Standard P90)</option>
                  <option value={0.95}>95% Confidence (Conservative)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Out-of-Sample Walk-Forward Coverage Panel & Worst Days Mini-Table */}
      {coverageData && (
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3.5 text-xs shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold text-slate-200">Out-of-Sample Walk-Forward Coverage (Jan 2–31):</span>
              <span className="text-slate-400">Target: <strong className="text-white font-mono">{coverageData.target_coverage_percent}%</strong></span>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="text-slate-400">Achieved: <strong className={coverageData.achieved_coverage_percent >= coverageData.target_coverage_percent - 1.0 ? "text-emerald-400 font-mono font-bold" : "text-amber-400 font-mono font-bold"}>{coverageData.achieved_coverage_percent}%</strong></span>
              <span className="text-slate-600 hidden sm:inline">•</span>
              <span className="text-slate-400">Worst Day: <strong className="text-rose-400 font-mono">{coverageData.worst_day_coverage_percent}%</strong> on {coverageData.worst_day_date}</span>
            </div>
            <span className="text-slate-500 font-mono text-[11px]">
              {coverageData.total_covered_periods}/{coverageData.total_evaluated_periods} SPs ({coverageData.evaluated_days_count} delivery days)
            </span>
          </div>

          {/* Worst Days Mini-Table */}
          {coverageData.worst_days && coverageData.worst_days.length > 0 && (
            <div className="pt-0.5 space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                Lowest-Coverage Delivery Days (Empirical Tail Events)
              </span>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-800/80 text-[11px]">
                      <th className="py-1.5 pr-4 font-medium">Delivery Date</th>
                      <th className="py-1.5 px-3 font-medium">Periods Covered</th>
                      <th className="py-1.5 px-3 font-medium">Day Coverage</th>
                      <th className="py-1.5 px-3 font-medium">Buffer Sized</th>
                      <th className="py-1.5 pl-3 font-medium">Signed Error Range (Min / Max)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {coverageData.worst_days.map((row) => (
                      <tr
                        key={row.date}
                        onClick={() => setSelectedDate && setSelectedDate(row.date)}
                        className={`transition ${setSelectedDate ? 'hover:bg-slate-800/60 cursor-pointer' : 'hover:bg-slate-800/30'} ${selectedDate === row.date ? 'bg-emerald-500/10' : ''}`}
                        title={setSelectedDate ? `Click to inspect hedge metrics for ${row.date}` : undefined}
                      >
                        <td className="py-1.5 pr-4 text-white font-medium">{row.date}</td>
                        <td className="py-1.5 px-3 text-slate-400">{row.covered_periods}/{row.total_periods} SPs</td>
                        <td className="py-1.5 px-3">
                          <span className={row.coverage_percent < 50 ? "text-rose-400 font-bold" : "text-amber-400 font-bold"}>
                            {row.coverage_percent}%
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-amber-300 font-mono">+{Math.round(row.buffer_mw).toLocaleString()} MW</td>
                        <td className="py-1.5 pl-3 text-slate-300 font-mono">
                          +{Math.round(row.min_error_mw).toLocaleString()} to +{Math.round(row.max_error_mw).toLocaleString()} MW
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed pt-2 border-t border-slate-800/60">
                <strong className="text-amber-400">Key Finding: </strong>
                The buffer protects on typical days but not when forecast error jumps beyond anything seen before (e.g. 28 Jan: buffer 4,098 MW, errors +4,123 to +6,210 MW, 0% covered).
              </p>
            </div>
          )}
        </div>
      )}

      {/* Day 1 In-Scope Notice when buffer is unavailable */}
      {!simData.buffer_available && (
        <div className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 flex items-start space-x-3 text-amber-300 shadow-md">
          <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-white">First Delivery Day ({selectedDate}): Buffer Unavailable</p>
            <p className="text-slate-300 leading-relaxed">
              No prior delivery days exist in the January 2026 scope to fit an out-of-sample expanding buffer. To eliminate lookahead bias, in-sample fallbacks are strictly prohibited. Please select delivery days from 2026-01-02 to 2026-01-31 to view empirical hedge recommendations.
            </p>
          </div>
        </div>
      )}

      {/* Simulator Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Raw Forecast Wind"
          value={totalForecastGWh}
          unit="GWh"
          subtitle={`Actual: ${totalActualGWh} GWh`}
          badge={`Cutoff ${cutoffTime}`}
          badgeType="info"
          icon={Wind}
          accentColor="emerald"
        />

        <MetricCard
          title="Recommended Reserve Buffer"
          value={reserveBufferDisplay}
          unit={simData.buffer_available ? "MW" : ""}
          subtitle={simData.buffer_sample_window || "No prior data in scope"}
          badge={simData.buffer_available ? `${(confidenceLevel * 100).toFixed(0)}% Signed VaR` : "No Prior Days"}
          badgeType={simData.buffer_available ? "warning" : "neutral"}
          icon={ShieldCheck}
          accentColor="amber"
        />

        <MetricCard
          title="Firm De-Risked Wind"
          value={totalFirmGWh}
          unit={simData.buffer_available ? "GWh" : ""}
          subtitle="max(0, Forecast - Buffer)"
          badge={simData.buffer_available ? "De-Risked Volume" : "Unavailable"}
          badgeType="neutral"
          icon={ShieldCheck}
          accentColor="blue"
        />

        <MetricCard
          title="Firm Delivery Coverage"
          value={simData.buffer_available ? `${coveredCount}/${totalCount} Covered` : 'Unavailable'}
          unit={simData.buffer_available ? "(Selected Day)" : ""}
          subtitle={coverageData ? `Month walk-forward: ${coverageData.achieved_coverage_percent}% (${coverageData.total_covered_periods}/${coverageData.total_evaluated_periods} SPs)` : "Single-day result"}
          badge={simData.buffer_available ? `${coveredCount}/${totalCount} SPs` : "No Prior Days"}
          badgeType="neutral"
          icon={CheckCircle2}
          accentColor="emerald"
        />
      </div>

      {/* Interactive Power Balance Chart */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
        <div className="pb-4 mb-4 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Wind Generation Hedge Profile & Firm De-Risked Volume</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Comparison of raw day-ahead forecast, the empirical out-of-sample reserve buffer, calculated firm wind volume, and actual delivered wind.
            </p>
          </div>
        </div>

        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="firmGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} interval={3} />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                label={{ value: 'Generation (MW)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-xl text-xs font-mono">
                        <p className="font-bold text-white text-sm pb-1 mb-1 border-b border-slate-800">
                          SP {item.sp} ({item.time} UTC)
                        </p>
                        <div className="space-y-1">
                          <p className="text-emerald-400">Wind Forecast: <strong>{item.windForecast?.toLocaleString() ?? 'N/A'} MW</strong></p>
                          <p className="text-amber-400">Reserve Buffer: <strong>{item.reserveBuffer?.toLocaleString()} MW</strong></p>
                          <p className="text-blue-400">Firm Wind: <strong>{item.firmWind?.toLocaleString()} MW</strong></p>
                          {item.windActual !== null && (
                            <p className="text-cyan-400 pt-1 border-t border-slate-800">
                              Actual Delivered: <strong>{item.windActual?.toLocaleString()} MW</strong>
                            </p>
                          )}
                          {item.satisfied !== null && (
                            <p className={item.satisfied ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                              Firm Met: {item.satisfied ? "YES" : `NO (Deficit: ${item.deficit?.toLocaleString()} MW)`}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 15, fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="windForecast"
                name="Wind Forecast (MW)"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#forecastGrad)"
              />
              <Area
                type="monotone"
                dataKey="firmWind"
                name="Firm Wind Commitment (MW)"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#firmGrad)"
              />
              <Line
                type="monotone"
                dataKey="reserveBuffer"
                name="Reserve Buffer (MW)"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="windActual"
                name="Actual Wind Delivered (MW)"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Methodology Box */}
        <div className="mt-5 p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between text-xs gap-3">
          <div className="flex items-center space-x-2.5">
            <Info className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-slate-300 leading-relaxed">
              <strong className="text-white font-semibold">Methodology: </strong>
              Firm Wind is defined as <strong className="text-emerald-400 font-mono">max(0, Forecast - Buffer)</strong>. The buffer is calculated using the empirical <strong className="text-amber-400 font-mono">{(confidenceLevel * 100).toFixed(0)}% Value-at-Risk</strong> of signed forecast errors (<strong className="text-slate-200">forecast - actual</strong>) fitted strictly out-of-sample from prior delivery days. Strictly uses Elexon FUELHH actuals and WINDFOR forecasts (no demand, cost, or price assumptions).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
