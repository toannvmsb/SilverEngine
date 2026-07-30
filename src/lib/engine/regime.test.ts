import { describe, expect, it } from "vitest";
import { combineRegime, evaluateHardTriggers, regimeFromScore } from "./regime";
import { HardTriggerContext } from "./types";

describe("regimeFromScore", () => {
  it("maps the documented integer boundaries correctly", () => {
    expect(regimeFromScore(0)).toBe("LOW");
    expect(regimeFromScore(20)).toBe("LOW");
    expect(regimeFromScore(21)).toBe("NORMAL");
    expect(regimeFromScore(35)).toBe("NORMAL");
    expect(regimeFromScore(36)).toBe("CAUTIOUS");
    expect(regimeFromScore(50)).toBe("CAUTIOUS");
    expect(regimeFromScore(51)).toBe("HIGH");
    expect(regimeFromScore(65)).toBe("HIGH");
    expect(regimeFromScore(66)).toBe("STRESS");
    expect(regimeFromScore(80)).toBe("STRESS");
    expect(regimeFromScore(81)).toBe("CRISIS");
    expect(regimeFromScore(100)).toBe("CRISIS");
  });

  // Regression test for a real bug found during review: scores are floats
  // rounded to 1 decimal (computeRiskScore), so values landing in the gap
  // between two buckets' integer bounds (e.g. 20.3, between LOW's max=20 and
  // NORMAL's min=21) must not fall through to an unmatched default.
  it("handles fractional scores that fall between two buckets' integer bounds", () => {
    expect(regimeFromScore(20.3)).toBe("LOW");
    expect(regimeFromScore(20.9)).toBe("LOW");
    expect(regimeFromScore(35.5)).toBe("NORMAL");
    expect(regimeFromScore(50.1)).toBe("CAUTIOUS");
    expect(regimeFromScore(65.9)).toBe("HIGH");
    expect(regimeFromScore(80.4)).toBe("STRESS");
  });

  it("never returns CRISIS for a middling score just because of a rounding gap", () => {
    for (let s = 0; s <= 100; s += 0.1) {
      const regime = regimeFromScore(Math.round(s * 10) / 10);
      if (s < 80.5) expect(regime).not.toBe("CRISIS");
    }
  });
});

describe("combineRegime", () => {
  it("never de-escalates below the score-derived regime", () => {
    expect(combineRegime("HIGH", "LOW")).toBe("HIGH");
    expect(combineRegime("HIGH", null)).toBe("HIGH");
  });

  it("escalates when the hard-trigger floor is more severe", () => {
    expect(combineRegime("LOW", "CRISIS")).toBe("CRISIS");
    expect(combineRegime("NORMAL", "STRESS")).toBe("STRESS");
  });
});

const BASE_CTX: HardTriggerContext = {
  buybackStatus: "NORMAL",
  phuquyQuoteAgeMinutes: 5,
  drawdown10d: -0.02,
  drawdown30d: -0.03,
  spreadPct: 0.02,
  criticalSourceUnavailable: false,
  modelServiceHealthy: true,
  portfolioStressLtv20: null,
};

describe("evaluateHardTriggers", () => {
  it("raises no triggers for a clean context", () => {
    const result = evaluateHardTriggers(BASE_CTX);
    expect(result.forceStop).toBe(false);
    expect(result.regimeFloor).toBeNull();
    expect(result.reasonCodes).toEqual([]);
  });

  it("forces STOP when buyback is not NORMAL", () => {
    const result = evaluateHardTriggers({ ...BASE_CTX, buybackStatus: "STOPPED" });
    expect(result.forceStop).toBe(true);
    expect(result.regimeFloor).toBe("CRISIS");
    expect(result.reasonCodes).toContain("BUYBACK_NOT_NORMAL");
  });

  it("forces STOP when the Phu Quy quote is stale beyond 30 minutes", () => {
    const result = evaluateHardTriggers({ ...BASE_CTX, phuquyQuoteAgeMinutes: 31 });
    expect(result.forceStop).toBe(true);
    expect(result.reasonCodes).toContain("DATA_STALE_CRITICAL");
  });

  it("does NOT force stop at exactly 30 minutes (boundary is > 30, not >=)", () => {
    const result = evaluateHardTriggers({ ...BASE_CTX, phuquyQuoteAgeMinutes: 30 });
    expect(result.forceStop).toBe(false);
  });

  it("disables 60/90-day terms and reduces LTV 10pt on a 10d drawdown beyond -15%", () => {
    const result = evaluateHardTriggers({ ...BASE_CTX, drawdown10d: -0.16 });
    expect(result.forceStop).toBe(false);
    expect(result.disabledTermDays).toEqual([60, 90]);
    expect(result.ltvReductionPoints).toBe(10);
    expect(result.regimeFloor).toBe("HIGH");
  });

  it("forces STOP on a 30d drawdown beyond -25%", () => {
    const result = evaluateHardTriggers({ ...BASE_CTX, drawdown30d: -0.3 });
    expect(result.forceStop).toBe(true);
    expect(result.reasonCodes).toContain("DRAWDOWN_30D_HIGH");
  });

  it("reduces LTV 10pt when spread exceeds 7%", () => {
    const result = evaluateHardTriggers({ ...BASE_CTX, spreadPct: 0.08 });
    expect(result.ltvReductionPoints).toBe(10);
    expect(result.forceStop).toBe(false);
  });

  it("forces STOP when a critical source is unavailable or the model service is unhealthy", () => {
    expect(evaluateHardTriggers({ ...BASE_CTX, criticalSourceUnavailable: true }).forceStop).toBe(true);
    expect(evaluateHardTriggers({ ...BASE_CTX, modelServiceHealthy: false }).forceStop).toBe(true);
  });

  it("disables long terms when portfolio stress LTV at -20% exceeds 80%", () => {
    const result = evaluateHardTriggers({ ...BASE_CTX, portfolioStressLtv20: 0.85 });
    expect(result.disabledTermDays).toEqual([60, 90]);
    expect(result.reasonCodes).toContain("PORTFOLIO_CONCENTRATION");
  });

  it("combines multiple simultaneous triggers without losing any reason code", () => {
    const result = evaluateHardTriggers({
      ...BASE_CTX,
      spreadPct: 0.08,
      drawdown10d: -0.16,
    });
    expect(result.reasonCodes).toContain("SPREAD_ABOVE_NORMAL");
    expect(result.reasonCodes).toContain("DRAWDOWN_10D_HIGH");
    expect(result.ltvReductionPoints).toBe(10); // max(), not additive
  });
});
