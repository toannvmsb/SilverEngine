import { ExpectedShortfallResult } from "./types";

/**
 * Section 7.2 — Expected Shortfall theo kỳ hạn.
 *
 *   returns_h = log(P[t+h] / P[t])
 *   VaR_q(h)  = quantile(returns_h, q)
 *   ES_q(h)   = mean(returns_h where returns_h <= VaR_q(h))
 *
 * Preferred method is historical simulation over a daily price series (block
 * overlapping h-day windows, as the doc's block-bootstrap note recommends to
 * preserve volatility clustering for longer horizons). When no price history
 * is available yet (fresh deployment, no ingestion pipeline running), we fall
 * back to a parametric normal approximation driven by EWMA volatility — this
 * is clearly weaker (no fat tails) and every result carries `method` so the
 * UI/audit trail can show which one produced a given haircut.
 */

const TRADING_DAYS_PER_YEAR = 365; // domestic Phu Quy quotes observed daily incl. weekends

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = q * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const frac = pos - lower;
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

export function historicalSimulationES(
  dailyPrices: number[],
  horizonDays: number,
  q: number
): ExpectedShortfallResult {
  const logReturnsH: number[] = [];
  for (let t = 0; t + horizonDays < dailyPrices.length; t++) {
    const p0 = dailyPrices[t];
    const ph = dailyPrices[t + horizonDays];
    if (p0 > 0 && ph > 0) logReturnsH.push(Math.log(ph / p0));
  }
  if (logReturnsH.length < 10) {
    throw new Error(
      `Not enough history for ${horizonDays}d horizon (need >=10 overlapping windows, got ${logReturnsH.length})`
    );
  }
  const sorted = [...logReturnsH].sort((a, b) => a - b);
  const varQ = quantile(sorted, q);
  const tail = sorted.filter((r) => r <= varQ);
  const esQ = tail.reduce((a, b) => a + b, 0) / tail.length;
  return { horizonDays, varQ, esQ, method: "historical_simulation" };
}

// Rational approximation of the inverse standard normal CDF (Acklam's algorithm).
function invNormCdf(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  if (p <= 0 || p >= 1) throw new Error("p must be in (0,1)");
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

/** Parametric normal-distribution ES fallback, scaled from annualized EWMA vol. */
export function parametricEwmaES(
  annualizedVol: number,
  horizonDays: number,
  q: number
): ExpectedShortfallResult {
  const sigmaH = annualizedVol * Math.sqrt(horizonDays / TRADING_DAYS_PER_YEAR);
  const zQ = invNormCdf(q);
  const varQ = zQ * sigmaH;
  const esQ = -sigmaH * (normalPdf(zQ) / q);
  return { horizonDays, varQ, esQ, method: "parametric_ewma" };
}

export function expectedPriceHaircut(es: ExpectedShortfallResult, policyFloor: number): number {
  return Math.max(Math.abs(es.esQ), policyFloor);
}
