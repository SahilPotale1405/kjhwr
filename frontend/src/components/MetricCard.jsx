import React from 'react';

export default function MetricCard({
  title,
  value,
  unit = '',
  subtitle,
  badge,
  badges,
  badgeType = 'neutral', // 'success', 'warning', 'danger', 'info', 'neutral'
  icon: Icon,
  accentColor = 'emerald', // 'emerald', 'blue', 'amber', 'rose', 'purple'
}) {
  const badgeStyles = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    danger: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    neutral: 'bg-slate-800 text-slate-300 border-slate-700',
  };

  const accentBorders = {
    emerald: 'hover:border-emerald-500/40',
    blue: 'hover:border-blue-500/40',
    amber: 'hover:border-amber-500/40',
    rose: 'hover:border-rose-500/40',
    purple: 'hover:border-purple-500/40',
  };

  const iconColors = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  };

  return (
    <div
      className={`relative p-5 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-sm transition-all duration-300 hover:shadow-xl ${accentBorders[accentColor] || accentBorders.emerald}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</p>
          <div className="flex items-baseline space-x-1.5 mt-2">
            <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white font-mono">
              {value}
            </span>
            {unit && <span className="text-sm font-medium text-slate-400 font-mono">{unit}</span>}
          </div>
        </div>

        {Icon && (
          <div className={`p-2.5 rounded-xl border ${iconColors[accentColor] || iconColors.emerald}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      <div className="mt-3 pt-2 border-t border-slate-800/60 space-y-1.5 text-xs">
        {subtitle && (
          <div className="text-slate-400 leading-snug">
            {subtitle}
          </div>
        )}
        {badges && badges.length > 0 ? (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {badges.map((b, idx) => (
              <span
                key={idx}
                className={`px-2 py-0.5 rounded-full border text-[10px] font-medium font-mono whitespace-nowrap ${
                  badgeStyles[b.type] || badgeStyles.neutral
                }`}
              >
                {b.text}
              </span>
            ))}
          </div>
        ) : badge ? (
          <div className="pt-0.5">
            <span
              className={`px-2 py-0.5 rounded-full border text-[11px] font-medium font-mono inline-block whitespace-nowrap ${
                badgeStyles[badgeType] || badgeStyles.neutral
              }`}
            >
              {badge}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
