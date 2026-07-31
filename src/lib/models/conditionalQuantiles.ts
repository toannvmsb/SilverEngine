// Regime-conditional historical quantiles — section 7 "Quantile regression:
// Dự báo tail return trực tiếp, output q1%, q2.5%, q5%" (Phase 2).
//
// A real quantile regression (pinball-loss minimization against covariates)
// trained on the few dozen/hundred days of price history this app has
// self-accumulated so far would be statistically meaningless — badly
// overfit, no ability to validate out-of-sample. Rather than build
// something that LOOKS sophisticated but produces noise, this implements
// the honest non-parametric version: bucket historical h-day forward
// returns by the trailing realized-vol regime at the time (LOW/MED/HIGH
// tercile), then read off empirical quantiles from whichever bucket matches
// today's vol regime. This is still "conditional" on market state — just
// via binning instead of a fitted regression — and degrades gracefully to
// the unconditional empirical quantile (what historicalSimulationES already
// does) when a bucket doesn't have enough samples yet.
//
// CHALLENGER ONLY — never wired into computeDecision/LTV. See Model
// Governance page.

import { loadDailySeries, logReturns } from "@/lib/ingestion/computeFeaturesFromHistory";

const VOL_WINDOW = 20;
const MIN_PER_BUCKET = 15;
const MIN_UNCONDITIONAL = 10;
const ANNUALIZATION = Math.sqrt(365);

export type VolBucket = "LOW" | "MED" | "HIGH";

export interface ConditionalQuantileResult {
  horizonDays: number;
  q1: number;
  q25: number;
  q5: number;
  method: "regime_conditional" | "unconditional_fallback";
  bucket: VolBucket | null;
  sampleSize: number;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
}

function quantile(sortedAsc: number[], q: number): number {
  const pos = q * (sortedAsc.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sortedAsc[lower];
  const frac = pos - lower;
  return sortedAsc[lower] * (1 - frac) + sortedAsc[upper] * frac;
}

function bucketOf(vol: number, lowCut: number, highCut: number): VolBucket {
  if (vol <= lowCut) return "LOW";
  if (vol >= highCut) return "HIGH";
  return "MED";
}

/**
 * Computes trailing realized vol at every index >= VOL_WINDOW, using the
 * VOL_WINDOW log returns ending at that index.
 */
function trailingVolSeries(logRets: number[]): (number | null)[] {
  return logRets.map((_, i) => {
    if (i < VOL_WINDOW) return null;
    return stdev(logRets.slice(i - VOL_WINDOW, i)) * ANNUALIZATION;
  });
}

export async function computeConditionalQuantiles(
  symbol: string,
  horizons: number[]
): Promise<ConditionalQuantileResult[] | null> {
  const series = await loadDailySeries(symbol, 500);
  const prices = series.map((s) => s.price);
  const maxHorizon = Math.max(...horizons);
  if (prices.length < VOL_WINDOW + maxHorizon + MIN_UNCONDITIONAL) return null;

  const logRets = logReturns(prices);
  const trailingVol = trailingVolSeries(logRets);
  const validVols = trailingVol.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const lowCut = quantile(validVols, 1 / 3);
  const highCut = quantile(validVols, 2 / 3);
  const currentVol = trailingVol[trailingVol.length - 1];
  const currentBucket = currentVol !== null ? bucketOf(currentVol, lowCut, highCut) : null;

  return horizons.map((h) => {
    // logRets index i corresponds to prices index i+1 (return from day i to i+1
    // in `prices`), so forward h-day return starting at logRets index i is
    // log(prices[i+1+h] / prices[i+1]).
    const pairs: { ret: number; bucket: VolBucket | null }[] = [];
    for (let i = VOL_WINDOW; i + h < prices.length - 1; i++) {
      const p0 = prices[i + 1];
      const ph = prices[i + 1 + h];
      if (p0 <= 0 || ph <= 0) continue;
      const ret = Math.log(ph / p0);
      const vol = trailingVol[i];
      pairs.push({ ret, bucket: vol !== null ? bucketOf(vol, lowCut, highCut) : null });
    }

    const conditional = currentBucket ? pairs.filter((p) => p.bucket === currentBucket).map((p) => p.ret) : [];
    const useConditional = conditional.length >= MIN_PER_BUCKET;
    const sample = (useConditional ? conditional : pairs.map((p) => p.ret)).sort((a, b) => a - b);

    return {
      horizonDays: h,
      q1: quantile(sample, 0.01),
      q25: quantile(sample, 0.025),
      q5: quantile(sample, 0.05),
      method: useConditional ? "regime_conditional" : "unconditional_fallback",
      bucket: useConditional ? currentBucket : null,
      sampleSize: sample.length,
    };
  });
}
