import { describe, expect, it } from "vitest";
import { computeRiskScore, RISK_SCORE_WEIGHTS } from "./riskScore";
import { RiskScoreInputs } from "./types";

const CALM: RiskScoreInputs = {
  priceVol: { vol30d: 0.1, vol90d: 0.1, ewmaVol: 0.1, drawdown20d: -0.01, drawdown60d: -0.01 },
  macro: { dxyChange20d: -0.02, realYield10y: -0.005, pmi: 55 },
  positioning: { cotNetLongPercentile: 50, oiShockPct: 0.02 },
  liquidity: { spreadPct: 0.01, buybackStatus: "NORMAL", priceDivergencePct: 0, liquidationDays: 0 },
  event: { hoursToNextEvent: 720, eventSeverity: "LOW" },
};

const STRESSED: RiskScoreInputs = {
  priceVol: { vol30d: 0.6, vol90d: 0.5, ewmaVol: 0.6, drawdown20d: -0.3, drawdown60d: -0.3 },
  macro: { dxyChange20d: 0.06, realYield10y: 0.03, pmi: 40 },
  positioning: { cotNetLongPercentile: 95, oiShockPct: 0.4 },
  liquidity: { spreadPct: 0.2, buybackStatus: "STOPPED", priceDivergencePct: 0.05, liquidationDays: 10 },
  event: { hoursToNextEvent: 1, eventSeverity: "HIGH" },
};

describe("computeRiskScore", () => {
  it("weights sum to 1.0 (so the aggregate score stays on a 0-100 scale)", () => {
    const sum = Object.values(RISK_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("scores a calm market low and a stressed market high", () => {
    const calm = computeRiskScore(CALM);
    const stressed = computeRiskScore(STRESSED);
    expect(calm.score).toBeLessThan(20);
    expect(stressed.score).toBeGreaterThan(70);
    expect(stressed.score).toBeGreaterThan(calm.score);
  });

  it("stays within [0, 100] even for extreme inputs", () => {
    const result = computeRiskScore(STRESSED);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    for (const v of Object.values(result.components)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("liquidity component is maxed out when buyback is STOPPED regardless of other liquidity inputs", () => {
    const result = computeRiskScore({
      ...CALM,
      liquidity: { spreadPct: 0.01, buybackStatus: "STOPPED", priceDivergencePct: 0, liquidationDays: 0 },
    });
    expect(result.components.liquidity).toBe(100);
  });

  it("higher realized volatility strictly increases the price/vol component, holding everything else fixed", () => {
    const low = computeRiskScore(CALM);
    const high = computeRiskScore({
      ...CALM,
      priceVol: { ...CALM.priceVol, vol30d: 0.4, ewmaVol: 0.4 },
    });
    expect(high.components.priceVol).toBeGreaterThan(low.components.priceVol);
  });

  it("the aggregate score is the exact weighted sum of the components", () => {
    const result = computeRiskScore(STRESSED);
    const expected =
      result.components.priceVol * RISK_SCORE_WEIGHTS.priceVol +
      result.components.macro * RISK_SCORE_WEIGHTS.macro +
      result.components.positioning * RISK_SCORE_WEIGHTS.positioning +
      result.components.liquidity * RISK_SCORE_WEIGHTS.liquidity +
      result.components.event * RISK_SCORE_WEIGHTS.event;
    expect(result.score).toBeCloseTo(Math.round(expected * 10) / 10, 5);
  });
});
