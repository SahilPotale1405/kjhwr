import React, { useState } from 'react';
import { Download, Search, ExternalLink, Database, Filter, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function RawDataViewer({
  data,
  selectedDate,
  cutoffTime,
  loading = false,
  error = null,
  onRetry = null,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDirection, setFilterDirection] = useState('all'); // 'all' | 'over' | 'under'

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent mb-4"></div>
        <p className="text-slate-400 font-mono text-sm">Loading Settlement Period Ledger...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 rounded-2xl bg-rose-950/20 border border-rose-800/60 text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
        <h3 className="text-base font-bold text-white">Failed to Load Raw Data Ledger</h3>
        <p className="text-xs text-rose-300 max-w-md mx-auto">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Ledger</span>
          </button>
        )}
      </div>
    );
  }

  if (!data || !data.periods || data.periods.length === 0) {
    return (
      <div className="py-24 text-center p-8 rounded-2xl bg-slate-900/40 border border-slate-800">
        <Database className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-slate-400 font-mono text-sm">No raw ledger data available for {selectedDate}.</p>
      </div>
    );
  }

  // Filter periods
  const filteredPeriods = data.periods.filter((p) => {
    const spMatch = p.settlementPeriod.toString().includes(searchTerm) || p.startTime.includes(searchTerm);
    if (!spMatch) return false;

    if (filterDirection === 'over') return p.error_mw > 0;
    if (filterDirection === 'under') return p.error_mw < 0;
    return true;
  });

  // Export to CSV
  const exportCsv = () => {
    const headers = [
      'SettlementPeriod',
      'StartTimeUTC',
      'ForecastMW',
      'ActualMW',
      'ErrorMW',
      'PercentageError',
      'ForecastPublishTime',
      'LeadTimeHours',
    ];

    const rows = data.periods.map((p) => [
      p.settlementPeriod,
      p.startTime,
      p.forecast_mw,
      p.actual_mw ?? '',
      p.error_mw ?? '',
      p.pct_error ?? '',
      p.forecast_publish_time,
      p.lead_time_hours,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `elexon_wind_day_ahead_${selectedDate}_cutoff_${cutoffTime.replace(':', '')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Endpoint Transparency Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Actuals Endpoint Card */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <h4 className="font-bold text-sm text-white">Actual Wind Generation (FUELHH)</h4>
            </div>
            <a
              href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono"
            >
              <span>Elexon Docs</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-xs text-slate-400">
            Filtered on <code className="text-emerald-400 font-mono">fuelType: "WIND"</code>. Resolution: 30-minute settlement periods (SP 1 - 48).
          </p>
          <div className="mt-2 text-[11px] font-mono text-slate-500 bg-slate-950 p-2 rounded-lg break-all">
            GET /bmrs/api/v1/datasets/FUELHH/stream?publishDateTimeFrom=...
          </div>
        </div>

        {/* Forecast Endpoint Card */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <h4 className="font-bold text-sm text-white">Wind Forecasts (WINDFOR)</h4>
            </div>
            <a
              href="https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono"
            >
              <span>Elexon Docs</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-xs text-slate-400">
            Filtered by latest <code className="text-emerald-400 font-mono">publishTime &lt;= {data?.decision_cutoff_utc?.replace('Z', ' UTC') || cutoffTime}</code> ({data?.cutoff_label || cutoffTime} on Day D-1).
          </p>
          <div className="mt-2 text-[11px] font-mono text-slate-500 bg-slate-950 p-2 rounded-lg break-all">
            GET /bmrs/api/v1/datasets/WINDFOR/stream?publishDateTimeFrom=...
          </div>
        </div>
      </div>

      {/* Table & Controls */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-800/80 gap-3">
          <div className="flex items-center space-x-3">
            <Database className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-base font-bold text-white">Settlement Period Audit Ledger</h3>
              <p className="text-xs text-slate-400">48 half-hour intervals for {selectedDate}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search SP or time..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Filter */}
            <select
              value={filterDirection}
              onChange={(e) => setFilterDirection(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
            >
              <option value="all">All Variations</option>
              <option value="over">Over-forecast only (&gt; 0)</option>
              <option value="under">Under-forecast only (&lt; 0)</option>
            </select>

            {/* Export CSV */}
            <button
              onClick={exportCsv}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold transition shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto max-h-[460px] scrollbar-thin">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 backdrop-blur-sm z-10 border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">SP</th>
                <th className="py-2.5 px-3">Start Time (UTC)</th>
                <th className="py-2.5 px-3 text-right">Forecast (MW)</th>
                <th className="py-2.5 px-3 text-right">Actual (MW)</th>
                <th className="py-2.5 px-3 text-right">Variance (MW)</th>
                <th className="py-2.5 px-3 text-right">Error %</th>
                <th className="py-2.5 px-3">Forecast Published</th>
                <th className="py-2.5 px-3 text-right">Lead (h)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredPeriods.map((p) => {
                const isOver = p.error_mw > 0;
                return (
                  <tr key={p.settlementPeriod} className="hover:bg-slate-800/40 transition">
                    <td className="py-2 px-3 font-bold text-white">SP {p.settlementPeriod}</td>
                    <td className="py-2 px-3 text-slate-300">{p.startTime.substring(11, 16)}</td>
                    <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                      {p.forecast_mw.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right text-cyan-400">
                      {p.actual_mw !== null ? p.actual_mw.toLocaleString() : '—'}
                    </td>
                    <td className={`py-2 px-3 text-right font-bold ${isOver ? 'text-amber-400' : 'text-blue-400'}`}>
                      {p.error_mw !== null ? `${p.error_mw >= 0 ? '+' : ''}${p.error_mw.toLocaleString()}` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">
                      {p.pct_error !== null ? `${p.pct_error}%` : '—'}
                    </td>
                    <td className="py-2 px-3 text-slate-400 text-[11px]">
                      {p.forecast_publish_time ? p.forecast_publish_time.replace('T', ' ').replace('Z', '') : 'N/A'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400">{p.lead_time_hours}h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
