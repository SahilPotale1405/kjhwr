import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import DayAheadCockpit from './components/DayAheadCockpit';
import AccuracyAnalytics from './components/AccuracyAnalytics';
import ThermalProcurementSimulator from './components/ThermalProcurementSimulator';
import ForecastConvergence from './components/ForecastConvergence';
import RawDataViewer from './components/RawDataViewer';
import { api } from './services/api';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('cockpit');
  const [selectedDate, setSelectedDate] = useState('2026-01-15');
  const [dateMetadata, setDateMetadata] = useState({
    min_date: '2026-01-01',
    max_date: '2026-01-31',
    default_date: '2026-01-15',
    dates: [],
  });
  const [cutoffTime, setCutoffTime] = useState('09:20');
  const [cutoffOptions, setCutoffOptions] = useState([]);
  const [targetConvergenceTime, setTargetConvergenceTime] = useState('2026-01-15T12:00:00Z');

  // Data states
  const [healthData, setHealthData] = useState(null);
  const [dayAheadData, setDayAheadData] = useState(null);
  const [overallAnalytics, setOverallAnalytics] = useState(null);
  const [spProfile, setSpProfile] = useState([]);
  const [dailyPerformance, setDailyPerformance] = useState([]);
  const [distribution, setDistribution] = useState([]);
  const [coverageData, setCoverageData] = useState(null);

  // Loading states
  const [loadingCockpit, setLoadingCockpit] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [cockpitRetryKey, setCockpitRetryKey] = useState(0);
  const [analyticsRetryKey, setAnalyticsRetryKey] = useState(0);

  // 1. Initial health & metadata fetch with AbortController
  useEffect(() => {
    const controller = new AbortController();
    const fetchMetadata = async () => {
      try {
        const [h, cutoffsData, datesData] = await Promise.all([
          api.getHealth({ signal: controller.signal }),
          api.getCutoffs({ signal: controller.signal }).catch(() => null),
          api.getDates({ signal: controller.signal }).catch(() => null),
        ]);
        if (!controller.signal.aborted) {
          setHealthData(h);
          if (datesData) {
            setDateMetadata(datesData);
            if (datesData.default_date) {
              setSelectedDate((prev) => (datesData.dates?.includes(prev) ? prev : datesData.default_date));
            }
          }
          if (cutoffsData?.options) {
            setCutoffOptions(cutoffsData.options);
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Metadata fetch failed:', err);
      }
    };
    fetchMetadata();
    return () => controller.abort();
  }, []);

  // 2. Fetch Day-Ahead data on date or cutoff change with AbortController
  useEffect(() => {
    const controller = new AbortController();
    const fetchDayAhead = async () => {
      setLoadingCockpit(true);
      setErrorMsg(null);
      try {
        const da = await api.getDayAhead(selectedDate, cutoffTime, { signal: controller.signal });
        setDayAheadData(da);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching day ahead data:', err);
        setErrorMsg('Failed to load Day-Ahead forecasts. Please check the backend connection.');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingCockpit(false);
        }
      }
    };
    fetchDayAhead();
    return () => controller.abort();
  }, [selectedDate, cutoffTime, cockpitRetryKey]);

  // 3. Fetch analytics when cutoff change or on mount with AbortController
  useEffect(() => {
    const controller = new AbortController();
    const fetchAnalytics = async () => {
      setLoadingAnalytics(true);
      setAnalyticsError(null);
      try {
        const [overall, profile, daily, dist, cov] = await Promise.all([
          api.getOverallAnalytics(cutoffTime, { signal: controller.signal }),
          api.getSettlementPeriodProfile(cutoffTime, { signal: controller.signal }),
          api.getDailyPerformance(cutoffTime, { signal: controller.signal }),
          api.getErrorDistribution(cutoffTime, 14, { signal: controller.signal }),
          api.getWalkForwardCoverage(cutoffTime, 0.90, { signal: controller.signal }).catch(() => null),
        ]);
        setOverallAnalytics(overall);
        setSpProfile(profile);
        setDailyPerformance(daily);
        setDistribution(dist);
        setCoverageData(cov);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching analytics:', err);
        setAnalyticsError('Failed to load quantitative accuracy analytics. Please retry.');
      } finally {
        if (!controller.signal.aborted) {
          setLoadingAnalytics(false);
        }
      }
    };
    fetchAnalytics();
    return () => controller.abort();
  }, [cutoffTime, analyticsRetryKey]);

  const handleViewConvergence = (startTime) => {
    setTargetConvergenceTime(startTime);
    setActiveTab('convergence');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        healthData={healthData}
        evaluatedCount={overallAnalytics?.total_evaluated_points}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/30 border border-rose-800 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => {
                setCockpitRetryKey((k) => k + 1);
                setAnalyticsRetryKey((k) => k + 1);
              }}
              className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-900/50 hover:bg-rose-800 text-rose-200 text-xs font-medium"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Tab 1: Day-Ahead Cockpit */}
        {activeTab === 'cockpit' && (
          <DayAheadCockpit
            data={dayAheadData}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            minDate={dateMetadata.min_date}
            maxDate={dateMetadata.max_date}
            cutoffTime={cutoffTime}
            setCutoffTime={setCutoffTime}
            cutoffOptions={cutoffOptions.length > 0 ? cutoffOptions : (dayAheadData?.available_cutoffs || [])}
            loading={loadingCockpit}
            error={errorMsg}
            onRetry={() => setCockpitRetryKey((k) => k + 1)}
            onViewConvergence={handleViewConvergence}
            overallAnalytics={overallAnalytics}
          />
        )}

        {/* Tab 2: Accuracy & Error Analytics */}
        {activeTab === 'analytics' && (
          <AccuracyAnalytics
            overall={overallAnalytics}
            spProfile={spProfile}
            dailyPerformance={dailyPerformance}
            distribution={distribution}
            coverageData={coverageData}
            cutoffTime={cutoffTime}
            setCutoffTime={setCutoffTime}
            cutoffOptions={cutoffOptions.length > 0 ? cutoffOptions : (dayAheadData?.available_cutoffs || [])}
            loading={loadingAnalytics}
            error={analyticsError}
            onRetry={() => setAnalyticsRetryKey((k) => k + 1)}
          />
        )}

        {/* Tab 3: Wind-Risk Hedge Calculator */}
        {activeTab === 'simulation' && (
          <ThermalProcurementSimulator
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            minDate={dateMetadata.min_date}
            maxDate={dateMetadata.max_date}
            cutoffTime={cutoffTime}
          />
        )}

        {/* Tab 4: Forecast Convergence & Evolution */}
        {activeTab === 'convergence' && (
          <ForecastConvergence
            targetTime={targetConvergenceTime}
            setTargetTime={setTargetConvergenceTime}
            cutoffTime={cutoffTime}
          />
        )}

        {/* Tab 5: Raw Data Ledger & Elexon Transparency */}
        {activeTab === 'data' && (
          <RawDataViewer
            data={dayAheadData}
            selectedDate={selectedDate}
            cutoffTime={cutoffTime}
            loading={loadingCockpit}
            error={errorMsg}
            onRetry={() => setCockpitRetryKey((k) => k + 1)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/50 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-2 font-mono">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>AeroProcure UK • Elexon BMRS Official Data Integration (January 2026)</span>
          </div>
          <div>
            <span>Built with React + Vite • Python FastAPI • Docker • TailwindCSS</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
