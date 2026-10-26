import React from 'react';
import { Wind, BarChart3, TrendingUp, Table, ShieldCheck } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, healthData, evaluatedCount }) {
  const navItems = [
    { id: 'cockpit', label: 'Day-Ahead Cockpit', shortLabel: 'Cockpit', icon: Wind },
    { id: 'analytics', label: 'Accuracy & Error Analytics', shortLabel: 'Accuracy', icon: BarChart3 },
    { id: 'simulation', label: 'Wind-Risk Hedge Calculator', shortLabel: 'Hedge Calc', icon: ShieldCheck },
    { id: 'convergence', label: 'Forecast Convergence', shortLabel: 'Convergence', icon: TrendingUp },
    { id: 'data', label: 'Raw Data & BMRS Specs', shortLabel: 'Data Ledger', icon: Table },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
              <Wind className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-white whitespace-nowrap">AeroProcure</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono font-medium whitespace-nowrap">UK Day-Ahead</span>
              </div>
              <p className="text-xs text-slate-400 hidden xl:block">Renewable Wind Procurement & Quantified Error Analytics</p>
            </div>
          </div>

          {/* Navigation Tabs (Desktop & Tablet) */}
          <nav className="hidden md:flex space-x-1 lg:space-x-1.5 shrink-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-1.5 px-2.5 lg:px-3 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className="hidden xl:inline">{item.label}</span>
                  <span className="inline xl:hidden">{item.shortLabel}</span>
                </button>
              );
            })}
          </nav>

          {/* System Status Pill */}
          <div className="flex items-center space-x-2 shrink-0">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
              <span className="text-slate-300 hidden lg:inline">Elexon Jan 2026</span>
              <span className="text-emerald-400 font-semibold whitespace-nowrap">
                {evaluatedCount
                  ? `${evaluatedCount.toLocaleString()} SPs`
                  : healthData?.database?.actuals_count
                  ? `${healthData.database.actuals_count.toLocaleString()} SPs`
                  : 'Live'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className="md:hidden flex overflow-x-auto px-4 py-2 border-t border-slate-800 space-x-2 bg-slate-900/95 scrollbar-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-medium transition ${
                isActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-800/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
}
