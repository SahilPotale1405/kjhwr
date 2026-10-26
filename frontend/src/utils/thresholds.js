/**
 * Centralized statistical threshold definitions for forecasting evaluation
 * Defines accuracy (WAPE / MAE) and directional bias criteria in one place.
 */

export const ACCURACY_THRESHOLDS = {
  LOW_ERROR_WAPE: 15.0,     // WAPE < 15%: low aggregate volume error
  MODERATE_ERROR_WAPE: 25.0, // WAPE 15-25%: moderate deviation
  BALANCED_BIAS_MW: 150.0,   // |Mean Bias| <= 150 MW: roughly balanced
};

export function getAccuracyBadge(wape) {
  if (wape === null || wape === undefined) {
    return { text: 'WAPE: Pending', type: 'neutral' };
  }
  if (wape < ACCURACY_THRESHOLDS.LOW_ERROR_WAPE) {
    return { text: `Low Error (WAPE ${wape}%)`, type: 'success' };
  }
  if (wape < ACCURACY_THRESHOLDS.MODERATE_ERROR_WAPE) {
    return { text: `Moderate Error (WAPE ${wape}%)`, type: 'warning' };
  }
  return { text: `High Variance (WAPE ${wape}%)`, type: 'danger' };
}

export function getBiasBadge(meanBiasMw, overCount, underCount) {
  if (meanBiasMw === null || meanBiasMw === undefined) {
    return { text: 'Bias: Pending', type: 'neutral' };
  }
  if (overCount === 48 && underCount === 0) {
    return { text: '100% Over-Forecast (48/0)', type: 'danger' };
  }
  if (underCount === 48 && overCount === 0) {
    return { text: '100% Under-Forecast (0/48)', type: 'danger' };
  }
  if (Math.abs(meanBiasMw) <= ACCURACY_THRESHOLDS.BALANCED_BIAS_MW) {
    return { text: 'Balanced (±150 MW)', type: 'success' };
  }
  if (meanBiasMw > 0) {
    return { text: `+${Math.round(meanBiasMw).toLocaleString()} MW Bias`, type: 'danger' };
  }
  return { text: `${Math.round(meanBiasMw).toLocaleString()} MW Bias`, type: 'info' };
}
