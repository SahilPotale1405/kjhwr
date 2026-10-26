import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  Calendar,
  Clock,
  Wind,
  Zap,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Sliders,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import MetricCard from './MetricCard';
import { getAccuracyBadge, getBiasBadge } from '../utils/thresholds';

export default function DayAheadCockpit({
  data,
  selectedDate,
  setSelectedDate,
  minDate = "2026-01-01",
  maxDate = "2026-01-31",
  cutoffTime,
  setCutoffTime,
  cutoffOptions = [],
  loading,
  error = null,
  onRetry = null,
  onViewConvergence,
  overallAnalytics = null,
}) {
  const [activeChartMode, setActiveChartMode] = useState('curves'); // 'curves' | 'error'

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-4"></div>
        <p className="text-slate-400 font-mono text-sm">Querying Elexon Day-Ahead Horizon...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-rose-950/20 border border-rose-800/60 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
        <h3 className="text-base font-bold text-white">Failed to Load Day-Ahead Data</h3>
        <p className="text-xs text-rose-300 max-w-md mx-auto">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Day-Ahead Data</span>
          </button>
        )}
      </div>
    );
  }

  if (!data || !data.periods || data.periods.length === 0) {
    return (
      <div className="py-24 text-center p-8 rounded-2xl bg-slate-900/40 border border-slate-800">
        <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-slate-400 font-mono text-sm">No Day-Ahead wind forecast or actuals found for {selectedDate}.</p>
      </div>
    );
  }

  // Options provided by backend as the single source of truth
  const activeCutoffOptions = cutoffOptions.length > 0 ? cutoffOptions : (data.available_cutoffs || []);

  // Formatting chart data
  const chartData = data.periods.map((p) => {
    const timeShort = p.startTime.substring(11, 16);
    return {
      sp: p.settlementPeriod,
      time: timeShort,
      startTime: p.startTime,
      forecast: p.forecast_mw,
      actual: p.actual_mw,
      error: p.error_mw,
      absError: p.abs_error_mw,
      pctError: p.pct_error,
      leadHours: p.lead_time_hours,
      publishTime: p.forecast_publish_time,
    };
  });

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-xs font-mono">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="font-bold text-white text-sm">SP {item.sp} ({item.time} UTC)</span>
            <span className="text-slate-400 text-[11px]">{item.startTime.substring(0, 10)}</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between space-x-4">
              <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Day-Ahead Forecast:
              </span>
              <span className="font-bold text-white">{item.forecast.toLocaleString()} MW</span>
            </div>
            {item.actual !== null && (
              <div className="flex items-center justify-between space-x-4">
                <span className="text-cyan-400 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  Actual Delivered:
                </span>
                <span className="font-bold text-white">{item.actual.toLocaleString()} MW</span>
              </div>
            )}
            {item.error !== null && (
              <div className="flex items-center justify-between space-x-4 pt-1 border-t border-slate-800/60">
                <span className="text-slate-400">Variance (Fc - Act):</span>
                <span className={`font-bold ${item.error >= 0 ? 'text-amber-400' : 'text-blue-400'}`}>
                  {item.error >= 0 ? `+${item.error.toLocaleString()}` : item.error.toLocaleString()} MW
                  {item.pctError !== null && ` (${item.pctError}%)`}
                </span>
              </div>
            )}
            <div className="text-[10px] text-slate-500 pt-1">
              Published: {item.publishTime ? item.publishTime.substring(11, 16) : 'N/A'} UTC ({item.leadHours}h lead)
            </div>
          </div>
          <button
            onClick={() => onViewConvergence && onViewConvergence(item.startTime)}
            className="mt-2.5 w-full py-1 px-2 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 text-[10px] font-sans font-medium flex items-center justify-center gap-1 transition"
          >
            <span>Inspect Forecast Convergence</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      );
    }
    return null;
  };

  const totalForecastGWh = (data.total_forecast_mwh / 1000).toFixed(1);
  const totalActualGWh = data.total_actual_mwh ? (data.total_actual_mwh / 1000).toFixed(1) : 'N/A';

  // Peak and minimum forecast settlement period and timing
  const peakPeriod = data.periods.find((p) => p.settlementPeriod === data.peak_forecast_sp) ||
    data.periods.reduce((max, p) => ((p.forecast_mw ?? -Infinity) > (max?.forecast_mw ?? -Infinity) ? p : max), null);

  const minPeriod = data.periods.reduce((min, p) => (
    p.forecast_mw !== null && (min === null || p.forecast_mw < min.forecast_mw) ? p : min
  ), null);

  const peakTimeStr = peakPeriod ? peakPeriod.startTime.substring(11, 16) : '00:00';
  const minTimeStr = minPeriod ? minPeriod.startTime.substring(11, 16) : '00:00';
  const minSP = minPeriod ? minPeriod.settlementPeriod : 1;

  // Centralized accuracy and bias thresholds
  const accuracyBadge = getAccuracyBadge(data.wape_percent);
  const biasBadge = getBiasBadge(data.mean_bias_mw, data.over_forecast_count, data.under_forecast_count);

  return (
    <div className="space-y-6">
      {/* Control Banner: Delivery Date & Cutoff Selector */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800/80 border border-slate-800 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Delivery Date Picker */}
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-medium text-slate-300">Delivery Date:</span>
              <input
                type="date"
                min={minDate}
                max={maxDate}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            {/* Decision Cutoff Selector */}
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-medium text-slate-300">Decision Cutoff (D-1):</span>
              <select
                value={cutoffTime}
                onChange={(e) => setCutoffTime(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 transition"
              >
                {activeCutoffOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Info Badge with Responsive Wrapping */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono text-slate-400 bg-slate-950/60 px-3.5 py-2 rounded-xl border border-slate-800 shrink-0">
            <span className="text-slate-500">Active Horizon:</span>
            <span className="text-emerald-400 font-semibold">{data.delivery_date}</span>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <span className="text-slate-300">
              Cutoff: <strong className="text-amber-300">{data.cutoff_label || cutoffTime}</strong>
            </span>
            <span className="text-slate-500 text-[11px]">
              ({data.decision_cutoff_utc.replace('Z', ' UTC')})
            </span>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Forecasted Wind Energy"
          value={totalForecastGWh}
          unit="GWh"
          subtitle={`Actual: ${totalActualGWh} GWh`}
          badge={`SP ${data.peak_forecast_sp} Peak`}
          badgeType="info"
          icon={Wind}
          accentColor="emerald"
        />

        <MetricCard
          title="Peak Wind Forecast"
          value={Math.round(data.peak_forecast_mw).toLocaleString()}
          unit="MW"
          subtitle={`Min: ${minPeriod ? Math.round(minPeriod.forecast_mw).toLocaleString() : 'N/A'} MW at SP ${minSP} (${minTimeStr} UTC)`}
          badge={`Peak at SP ${data.peak_forecast_sp} (${peakTimeStr} UTC)`}
          badgeType="neutral"
          icon={TrendingUp}
          accentColor="blue"
        />

        <MetricCard
          title="Day-Ahead MAE"
          value={data.mae_mw ? Math.round(data.mae_mw).toLocaleString() : 'N/A'}
          unit="MW"
          subtitle={data.wape_percent ? `WAPE: ${data.wape_percent}%` : 'Evaluation Pending'}
          badge={accuracyBadge.text}
          badgeType={accuracyBadge.type}
          icon={AlertCircle}
          accentColor="amber"
        />

        <MetricCard
          title="Net Forecast Bias"
          value={data.mean_bias_mw ? (data.mean_bias_mw >= 0 ? `+${Math.round(data.mean_bias_mw).toLocaleString()}` : Math.round(data.mean_bias_mw).toLocaleString()) : 'N/A'}
          unit="MW"
          subtitle={`${data.over_forecast_count} over / ${data.under_forecast_count} under`}
          badge={biasBadge.text}
          badgeType={biasBadge.type}
          icon={Zap}
          accentColor="rose"
        />
      </div>

      {/* Main Interactive Chart */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-800/80 gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Wind className="w-4 h-4 text-emerald-400" />
              <span>Day-Ahead Wind Forecast vs Actual Generation</span>
              <span className="text-xs font-normal text-slate-400 font-mono">({selectedDate} • 48 Settlement Periods)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Reflects the latest Elexon WINDFOR forecast published prior to {data.cutoff_label || cutoffTime} on Day D-1.
            </p>
          </div>

          {/* Chart Mode Toggle */}
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-medium self-start sm:self-auto">
            <button
              onClick={() => setActiveChartMode('curves')}
              className={`px-3 py-1 rounded-lg transition ${
                activeChartMode === 'curves'
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Generation Curves
            </button>
            <button
              onClick={() => setActiveChartMode('error')}
              className={`px-3 py-1 rounded-lg transition ${
                activeChartMode === 'error'
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Procurement Error (MW)
            </button>
          </div>
        </div>

        {/* Chart View */}
        <div className="h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {activeChartMode === 'curves' ? (
              <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  interval={3}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  label={{ value: 'Generation (MW)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: 15, fontSize: 12 }}
                  formatter={(value) => <span className="text-slate-300 font-medium">{value}</span>}
                />
                <Area
                  type="monotone"
                  dataKey="forecast"
                  fill="url(#forecastGrad)"
                  stroke="none"
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  name="Day-Ahead Forecast (MW)"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual Delivered Wind (MW)"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} interval={3} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'Error = Forecast - Actual (MW)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 15, fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="error"
                  name="Forecast Variance (MW)"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#errorGrad)"
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Procurement Insight Footer */}
        <div className="mt-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col lg:flex-row items-start lg:items-center justify-between text-xs gap-3">
          <div className="flex items-start space-x-2.5">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-slate-300 space-y-1">
              <p>
                <strong className="text-emerald-400 font-medium">Day Takeaway ({selectedDate}): </strong>
                {data.mean_bias_mw && data.mean_bias_mw > 0 ? (
                  <>Day-ahead forecast over-estimated wind by an average of <strong className="text-amber-300 font-mono">+{Math.round(data.mean_bias_mw).toLocaleString()} MW</strong> (forecast exceeded actual in {data.over_forecast_count} of 48 periods).</>
                ) : (
                  <>Day-ahead forecast under-estimated wind by an average of <strong className="text-blue-300 font-mono">{Math.round(data.mean_bias_mw).toLocaleString()} MW</strong> (actual exceeded forecast in {data.under_forecast_count} of 48 periods).</>
                )}
              </p>
              {overallAnalytics && (
                <p className="text-slate-400 text-[11px]">
                  <strong className="text-slate-300">January Full-Month Context ({cutoffTime} cutoff): </strong>
                  Across all {overallAnalytics.total_evaluated_points.toLocaleString()} half-hours, wind forecasts over-estimate in <strong className="text-rose-400 font-mono font-semibold">{overallAnalytics.pct_over_forecast}%</strong> of periods, with a month-level MAE of <strong className="text-amber-300 font-mono font-semibold">{Math.round(overallAnalytics.mae_mw).toLocaleString()} MW</strong> (Mean Bias: +{Math.round(overallAnalytics.mean_bias_mw).toLocaleString()} MW).
                </p>
              )}
            </div>
          </div>

          <div className="text-slate-500 text-[11px] font-mono shrink-0 self-end lg:self-center">
            Source: Elexon BMRS WINDFOR & FUELHH
          </div>
        </div>
      </div>

      {/* Settlement Periods Overview Grid */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Settlement Period Matrix (SP 1 - 48)</span>
              <span className="text-xs font-normal text-slate-400 font-mono">Whole MW breakdown</span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">Click any period to inspect forecast convergence</p>
          </div>

          {/* Color Legend for matrix cells */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-rose-950/50 border border-rose-500/70 inline-block"></span>
              <span className="text-slate-300">High Variance (&gt;20% error)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-amber-950/40 border border-amber-500/60 inline-block"></span>
              <span className="text-slate-300">Over-Forecast (Act &lt; Fc)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-blue-950/40 border border-blue-500/60 inline-block"></span>
              <span className="text-slate-300">Under-Forecast (Act &gt; Fc)</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-12 gap-2">
          {chartData.map((item) => {
            const isOver = item.error !== null && item.error > 0;
            const isHighError = item.pctError !== null && item.pctError > 20;

            return (
              <button
                key={item.sp}
                onClick={() => onViewConvergence && onViewConvergence(item.startTime)}
                className={`p-2 rounded-xl border text-left transition-all hover:scale-105 ${
                  isHighError
                    ? 'bg-rose-950/25 border-rose-700/60 hover:border-rose-400'
                    : isOver
                    ? 'bg-amber-950/20 border-amber-800/40 hover:border-amber-500'
                    : 'bg-slate-800/40 border-slate-700/50 hover:border-emerald-500'
                }`}
                title={`SP ${item.sp} (${item.time}): Fc ${Math.round(item.forecast).toLocaleString()} MW, Act ${item.actual !== null ? Math.round(item.actual).toLocaleString() + ' MW' : 'N/A'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">SP {item.sp}</span>
                  <span className="text-[9px] font-mono text-slate-500">{item.time}</span>
                </div>
                <div className="text-xs font-bold text-white font-mono mt-1 truncate">
                  {Math.round(item.forecast).toLocaleString()} MW
                </div>
                <div className={`text-[10px] font-mono mt-0.5 truncate ${item.error >= 0 ? 'text-amber-400' : 'text-blue-400'}`}>
                  {item.error !== null ? `${item.error >= 0 ? '+' : ''}${Math.round(item.error).toLocaleString()} MW` : '—'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
