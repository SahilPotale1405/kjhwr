/**
 * API Client for Backend Services
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

async function fetchJson(url, options = {}) {
  const fullUrl = `${API_BASE}${url}`;
  const res = await fetch(fullUrl, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error (${res.status}): ${errorText || res.statusText}`);
  }

  return res.json();
}

export const api = {
  getHealth: (options = {}) => fetchJson('/api/health', options),
  getDates: (options = {}) => fetchJson('/api/dates', options),
  getCutoffs: (options = {}) => fetchJson('/api/cutoffs', options),
  getDayAhead: (deliveryDate, cutoffTime = '09:20', options = {}) =>
    fetchJson(`/api/forecasts/day-ahead?delivery_date=${deliveryDate}&cutoff_time=${cutoffTime}`, options),
  getConvergence: (startTime, options = {}) =>
    fetchJson(`/api/forecasts/convergence?start_time=${encodeURIComponent(startTime)}`, options),
  getOverallAnalytics: (cutoffTime = '09:20', options = {}) =>
    fetchJson(`/api/analytics/overall?cutoff_time=${cutoffTime}`, options),
  getSettlementPeriodProfile: (cutoffTime = '09:20', options = {}) =>
    fetchJson(`/api/analytics/settlement-period-profile?cutoff_time=${cutoffTime}`, options),
  getDailyPerformance: (cutoffTime = '09:20', options = {}) =>
    fetchJson(`/api/analytics/daily?cutoff_time=${cutoffTime}`, options),
  getErrorDistribution: (cutoffTime = '09:20', bins = 14, options = {}) =>
    fetchJson(`/api/analytics/error-distribution?cutoff_time=${cutoffTime}&bins=${bins}`, options),
  simulateProcurement: (payload, options = {}) =>
    fetchJson('/api/procurement/simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
      ...options,
    }),
  getWalkForwardCoverage: (cutoffTime = '09:20', confidenceLevel = 0.90, options = {}) =>
    fetchJson(`/api/procurement/coverage?cutoff_time=${cutoffTime}&confidence_level=${confidenceLevel}`, options),
};
