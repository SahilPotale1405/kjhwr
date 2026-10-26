import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, Clock, AlertCircle, RefreshCw, Info, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';

export default function ForecastConvergence({ targetTime, setTargetTime, cutoffTime = '09:20' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!targetTime) return;
    const controller = new AbortController();
    const fetchConvergence = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.getConvergence(targetTime, { signal: controller.signal });
        setData(res);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching convergence:', err);
        setError('Failed to load forecast revision history. Please retry.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    fetchConvergence();
    return () => controller.abort();
  }, [targetTime, retryKey]);

  const presetTimes = [
    { label: '2026-01-15 12:00 UTC (SP 25)', value: '2026-01-15T12:00:00Z' },
    { label: '2026-01-15 18:00 UTC (SP 37)', value: '2026-01-15T18:00:00Z' },
    { label: '2026-01-01 12:00 UTC (SP 25)', value: '2026-01-01T12:00:00Z' },
    { label: '2026-01-22 17:00 UTC (SP 35)', value: '2026-01-22T17:00:00Z' },
  ];

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-4"></div>
        <p className="text-slate-400 font-mono text-sm">Loading Forecast Revision History...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-rose-950/20 border border-rose-800/60 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
        <h3 className="text-base font-bold text-white">Convergence Data Fetch Failed</h3>
        <p className="text-xs text-rose-300 max-w-md mx-auto">{error}</p>
        <button
          onClick={() => setRetryKey((k) => k + 1)}
          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-24 text-center p-8 rounded-2xl bg-slate-900/40 border border-slate-800">
        <Info className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-slate-400 font-mono text-sm">No forecast revision records available for target time.</p>
      </div>
    );
  }

  // Calculate Day D-1 decision cutoff timestamp for this target delivery date
  const targetDateObj = new Date(data.targetStartTime);
  const dMinus1Obj = new Date(Date.UTC(targetDateObj.getUTCFullYear(), targetDateObj.getUTCMonth(), targetDateObj.getUTCDate() - 1));
  const dMinus1Str = dMinus1Obj.toISOString().substring(0, 10);
  const cutoffIso = `${dMinus1Str}T${cutoffTime}:00Z`;

  // Find the exact revision that was actually used for the Day-Ahead decision (latest <= cutoff)
  const eligibleRevisions = (data.revisions || []).filter((r) => r.publishTime <= cutoffIso);
  const usedRevision = eligibleRevisions.length > 0 ? eligibleRevisions[eligibleRevisions.length - 1] : null;

  // Maximum lead time computed strictly from the plotted revision data
  const maxLeadHours = data.revisions && data.revisions.length > 0
    ? Math.round(Math.max(...data.revisions.map((r) => r.leadTimeHours || 0)))
    : null;

  // Chart data formatting with segment classification (available <= cutoff vs post-cutoff vs post-delivery)
  const chartData = (data.revisions || []).map((r) => {
    const isEligible = r.publishTime <= cutoffIso;
    const isPostDelivery = r.publishTime > data.targetStartTime;
    const isPostCutoff = !isEligible && !isPostDelivery;
    const isUsed = usedRevision && r.publishTime === usedRevision.publishTime;

    return {
      publishTime: r.publishTime,
      displayTime: r.publishTime.substring(5, 16).replace('T', ' '),
      leadHours: r.leadTimeHours,
      forecast: r.generation,
      // Solid series: available for decision at or before cutoff
      forecastAvailable: isEligible ? r.generation : null,
      // Dashed grey series: published after cutoff (connects from usedRevision)
      forecastPostCutoff: (r.publishTime >= (usedRevision?.publishTime || cutoffIso) && !isPostDelivery) ? r.generation : null,
      // Dotted dark series: published after target delivery time
      forecastPostDelivery: isPostDelivery ? r.generation : null,
      actual: data.actual_mw,
      isUsed,
      status: isPostDelivery ? 'post_delivery' : (isPostCutoff ? 'post_cutoff' : 'available'),
    };
  });

  // Custom dot renderer to visibly highlight the used decision run with an amber beacon
  const renderAvailableDot = (props) => {
    const { cx, cy, payload } = props;
    if (!cx || !cy) return null;
    if (payload.isUsed) {
      return (
        <g key={payload.publishTime}>
          <circle cx={cx} cy={cy} r={9} fill="#f59e0b" fillOpacity={0.25} stroke="#f59e0b" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={4.5} fill="#f59e0b" stroke="#ffffff" strokeWidth={1} />
        </g>
      );
    }
    return <circle key={payload.publishTime} cx={cx} cy={cy} r={3} fill="#10b981" />;
  };

  const usedDisplayTime = usedRevision ? usedRevision.publishTime.substring(5, 16).replace('T', ' ') : null;

  return (
    <div className="space-y-6">
      {/* Target Selector Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800/80 border border-slate-800 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-mono font-medium">
                Lead Time Analysis
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Target: {data.targetStartTime.replace('T', ' ').replace('Z', ' UTC')} (SP {data.settlementPeriod})
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-white mt-1">
              Forecast Evolution & Lead-Time Convergence
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tracks how wind forecast runs updated from {maxLeadHours ? `${maxLeadHours} hours ahead` : 'initial publication'} through gate closure ({cutoffTime}) to delivery.
            </p>
          </div>

          <div className="flex items-center space-x-2 bg-slate-950/60 p-2 rounded-xl border border-slate-800 self-start sm:self-auto">
            <Clock className="w-4 h-4 text-emerald-400" />
            <select
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            >
              {presetTimes.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Convergence Chart */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
        <div className="pb-4 mb-4 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Forecast Revisions vs Delivered Actual Generation</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Chronological revisions (longest lead time to shortest). Amber beacon marks the decision run selected at cutoff {cutoffTime}.
            </p>
          </div>

          <div className="text-xs font-mono text-slate-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-2 self-start sm:self-auto">
            <span>Actual Delivered:</span>
            <strong className="text-cyan-400">{data.actual_mw ? `${data.actual_mw.toLocaleString()} MW` : 'N/A'}</strong>
          </div>
        </div>

        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 15, right: 20, left: 0, bottom: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="displayTime"
                stroke="#64748b"
                fontSize={10}
                tickLine={false}
                angle={-25}
                textAnchor="end"
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={[
                  (dataMin) => Math.max(0, Math.floor((dataMin * 0.95) / 500) * 500),
                  (dataMax) => Math.ceil((dataMax * 1.05) / 500) * 500,
                ]}
                tickFormatter={(val) => `${val.toLocaleString()} MW`}
                label={{ value: 'Wind Power (MW)', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-xl text-xs font-mono space-y-1.5">
                        <div className="flex items-center justify-between pb-1 mb-1 border-b border-slate-800">
                          <span className="font-bold text-white text-sm">
                            {item.publishTime.replace('T', ' ').replace('Z', ' UTC')}
                          </span>
                          {item.isUsed && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                              DAY-AHEAD DECISION RUN
                            </span>
                          )}
                        </div>
                        <p className="text-emerald-400">Forecasted: <strong>{item.forecast?.toLocaleString()} MW</strong></p>
                        <p className="text-cyan-400">Actual Delivered: <strong>{item.actual ? `${item.actual.toLocaleString()} MW` : 'N/A'}</strong></p>
                        <p className="text-amber-300">Lead Time: <strong>{item.leadHours} hours ahead</strong></p>
                        {item.status === 'post_cutoff' && (
                          <p className="text-slate-400 text-[11px] italic pt-1 border-t border-slate-800">
                            Published after cutoff ({cutoffTime}) — not available at decision time
                          </p>
                        )}
                        {item.status === 'post_delivery' && (
                          <p className="text-rose-400 text-[11px] italic pt-1 border-t border-slate-800">
                            Post-delivery revision — historical archive only
                          </p>
                        )}
                        {item.actual && (
                          <p className="text-slate-300 pt-1 border-t border-slate-800 font-semibold">
                            Variance: {item.forecast - item.actual >= 0 ? '+' : ''}{(item.forecast - item.actual).toLocaleString()} MW
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: 15, fontSize: 11 }} />

              {/* Dashed Delivered Actual Generation Line */}
              {data.actual_mw !== null && (
                <ReferenceLine
                  y={data.actual_mw}
                  stroke="#06b6d4"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{ value: `Delivered Actual: ${data.actual_mw.toLocaleString()} MW`, fill: '#06b6d4', position: 'top', fontSize: 10 }}
                />
              )}

              {/* Vertical Reference Line at Decision Cutoff */}
              {usedDisplayTime && (
                <ReferenceLine
                  x={usedDisplayTime}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  label={{
                    value: `Decision Cutoff: ${cutoffTime}`,
                    fill: '#f59e0b',
                    position: 'top',
                    fontSize: 10,
                    fontWeight: 'bold',
                  }}
                />
              )}

              {/* Series 1: Available at or before cutoff (solid line) */}
              <Line
                type="monotone"
                dataKey="forecastAvailable"
                name="Day-Ahead Available Runs (≤ Cutoff)"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={renderAvailableDot}
                activeDot={{ r: 6 }}
              />

              {/* Series 2: Published after cutoff (dashed grey line) */}
              <Line
                type="monotone"
                dataKey="forecastPostCutoff"
                name="Published after cutoff (not available at decision time)"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ r: 3, fill: '#94a3b8' }}
              />

              {/* Series 3: Post-delivery revisions */}
              {chartData.some((p) => p.forecastPostDelivery !== null) && (
                <Line
                  type="monotone"
                  dataKey="forecastPostDelivery"
                  name="Post-delivery runs (historical archive)"
                  stroke="#64748b"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  dot={{ r: 2.5, fill: '#64748b' }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Lead time takeaway */}
        <div className="mt-4 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center space-x-3 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-slate-300">
            <strong>Forecast Evolution: </strong>
            Early forecasts published at maximum lead time ({maxLeadHours ? `${maxLeadHours}h ahead` : 'prior to D-1'}) exhibit wider variation. As gate closure ({cutoffTime}) approaches, revision runs update toward delivery; only revisions published at or before the decision cutoff are available for Day-Ahead trading.
          </p>
        </div>
      </div>
    </div>
  );
}
