import { describe, expect, it } from "vitest";
import { computeInterestRateApr } from "./interestEngine";
import { DEFAULT_POLICY_CONFIG } from "./constants";
import { PolicyConfig } from "./types";

describe("computeInterestRateApr", () => {
  it("matches the exact formula: base + term*perDay + regimePremium + (score/100)*maxScorePremium", () => {
    const apr = computeInterestRateApr(DEFAULT_POLICY_CONFIG, "NORMAL", 0, 7);
    const expected = 18 + 7 * 0.02 + 1 + 0;
    expect(apr).toBeCloseTo(expected, 2);
  });

  it("clamps to maxAprPct for an extreme combination", () => {
    const apr = computeInterestRateApr(DEFAULT_POLICY_CONFIG, "STRESS", 100, 90);
    // raw = 18 + 90*0.02 + 10 + 5 = 34.8, way above maxAprPct=20
    expect(apr).toBe(DEFAULT_POLICY_CONFIG.interest.maxAprPct);
  });

  it("clamps to minAprPct when the raw formula would land below it", () => {
    const lowBasePolicy: PolicyConfig = {
      ...DEFAULT_POLICY_CONFIG,
      interest: { ...DEFAULT_POLICY_CONFIG.interest, baseAprPct: 2 },
    };
    const apr = computeInterestRateApr(lowBasePolicy, "LOW", 0, 7);
    // raw = 2 + 0.14 + 0 + 0 = 2.14, below minAprPct=12
    expect(apr).toBe(lowBasePolicy.interest.minAprPct);
  });

  it("is monotonically non-decreasing in regime severity, holding score/term fixed", () => {
    const regimes = ["LOW", "NORMAL", "CAUTIOUS", "HIGH", "STRESS"] as const;
    let prev = -Infinity;
    for (const regime of regimes) {
      const apr = computeInterestRateApr(DEFAULT_POLICY_CONFIG, regime, 25, 30);
      expect(apr).toBeGreaterThanOrEqual(prev);
      prev = apr;
    }
  });

  it("is monotonically non-decreasing in risk score, holding regime/term fixed", () => {
    const low = computeInterestRateApr(DEFAULT_POLICY_CONFIG, "NORMAL", 0, 30);
    const high = computeInterestRateApr(DEFAULT_POLICY_CONFIG, "NORMAL", 100, 30);
    expect(high).toBeGreaterThanOrEqual(low);
  });

  it("is monotonically non-decreasing in term length, holding regime/score fixed", () => {
    const short = computeInterestRateApr(DEFAULT_POLICY_CONFIG, "NORMAL", 25, 7);
    const long = computeInterestRateApr(DEFAULT_POLICY_CONFIG, "NORMAL", 25, 90);
    expect(long).toBeGreaterThanOrEqual(short);
  });

  it("never produces a rate outside [minAprPct, maxAprPct] for any regime/score/term combination", () => {
    const regimes = ["LOW", "NORMAL", "CAUTIOUS", "HIGH", "STRESS", "CRISIS"] as const;
    for (const regime of regimes) {
      for (const score of [0, 25, 50, 75, 100]) {
        for (const term of [7, 14, 30, 60, 90]) {
          const apr = computeInterestRateApr(DEFAULT_POLICY_CONFIG, regime, score, term);
          expect(apr).toBeGreaterThanOrEqual(DEFAULT_POLICY_CONFIG.interest.minAprPct);
          expect(apr).toBeLessThanOrEqual(DEFAULT_POLICY_CONFIG.interest.maxAprPct);
        }
      }
    }
  });
});
