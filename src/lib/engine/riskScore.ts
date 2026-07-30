import {
  EventInputs,
  LiquidityInputs,
  MacroInputs,
  PositioningInputs,
  PriceVolInputs,
  RiskScoreComponents,
  RiskScoreInputs,
  RiskScoreResult,
} from "./types";

// Section 7.1 Risk Score v1 — component weights (must sum to 1.0)
export const RISK_SCORE_WEIGHTS = {
  priceVol: 0.3,
  macro: 0.2,
  positioning: 0.15,
  liquidity: 0.25,
  event: 0.1,
};

/**
 * Clamp then linearly interpolate x from [x0,x1] to [y0,y1].
 */
function scale(x: number, x0: number, x1: number, y0: number, y1: number): number {
  if (x1 === x0) return y0;
  const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return y0 + t * (y1 - y0);
}

// NOTE on calibration: the source doc normalizes each component "về 0-100 bằng
// percentile lịch sử hoặc piecewise thresholds". A percentile approach needs a
// history of observations the MVP does not yet have (no automated ingestion
// running). These functions implement the piecewise-threshold fallback the doc
// explicitly allows; once enough history accumulates in market_observation /
// feature_snapshot, replace with true percentile ranking without touching the
// callers below.

function priceVolScore(i: PriceVolInputs): number {
  const volScore = scale(Math.max(i.vol30d, i.ewmaVol), 0.1, 0.6, 0, 100);
  const vol90Score = scale(i.vol90d, 0.1, 0.5, 0, 100);
  const ddScore = scale(-Math.min(i.drawdown20d, i.drawdown60d), 0.03, 0.3, 0, 100);
  return 0.5 * volScore + 0.2 * vol90Score + 0.3 * ddScore;
}

function macroScore(i: MacroInputs): number {
  const dxyScore = scale(i.dxyChange20d, -0.02, 0.06, 0, 100); // dollar strength -> headwind
  const yieldScore = scale(i.realYield10y, -0.005, 0.03, 0, 100); // higher real yield -> headwind
  const pmiScore = scale(50 - i.pmi, -5, 10, 0, 100); // PMI below 50 -> higher score (slowdown -> haven demand mixed, kept mild)
  return 0.4 * dxyScore + 0.4 * yieldScore + 0.2 * pmiScore;
}

function positioningScore(i: PositioningInputs): number {
  // Risk rises the more "crowded" positioning is at either extreme (distance from 50th pctl).
  const crowding = Math.abs(i.cotNetLongPercentile - 50) * 2; // 0-100
  const oiScore = scale(i.oiShockPct, 0.05, 0.4, 0, 100);
  return 0.65 * crowding + 0.35 * oiScore;
}

function liquidityScore(i: LiquidityInputs): number {
  if (i.buybackStatus === "STOPPED") return 100;
  const spreadScore = scale(i.spreadPct, 0.01, 0.2, 0, 100);
  const divergenceScore = scale(Math.abs(i.priceDivergencePct), 0.005, 0.05, 0, 100);
  const liquidationScore = scale(i.liquidationDays, 0, 10, 0, 100);
  const restrictedPenalty = i.buybackStatus === "RESTRICTED" ? 25 : 0;
  return Math.min(
    100,
    0.4 * spreadScore + 0.2 * divergenceScore + 0.2 * liquidationScore + restrictedPenalty
  );
}

function eventScore(i: EventInputs): number {
  const severityBase = { LOW: 10, MEDIUM: 40, HIGH: 80 }[i.eventSeverity];
  const proximityMultiplier = scale(72 - i.hoursToNextEvent, 0, 72, 0.2, 1.2);
  return Math.min(100, severityBase * proximityMultiplier);
}

export function computeRiskScore(inputs: RiskScoreInputs): RiskScoreResult {
  const components: RiskScoreComponents = {
    priceVol: round1(priceVolScore(inputs.priceVol)),
    macro: round1(macroScore(inputs.macro)),
    positioning: round1(positioningScore(inputs.positioning)),
    liquidity: round1(liquidityScore(inputs.liquidity)),
    event: round1(eventScore(inputs.event)),
  };

  const score =
    components.priceVol * RISK_SCORE_WEIGHTS.priceVol +
    components.macro * RISK_SCORE_WEIGHTS.macro +
    components.positioning * RISK_SCORE_WEIGHTS.positioning +
    components.liquidity * RISK_SCORE_WEIGHTS.liquidity +
    components.event * RISK_SCORE_WEIGHTS.event;

  return { score: round1(score), components };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
