import { describe, expect, it } from "vitest";
import { buildTermPolicies, computeDecision, computeLiquidityFactor, MarketContext } from "./decisionEngine";
import { DEFAULT_POLICY_CONFIG } from "./constants";
import { HardTriggerOutcome, PolicyConfig, TransactionRequestInput } from "./types";

const NO_TRIGGERS: HardTriggerOutcome = {
  forceStop: false,
  regimeFloor: null,
  disabledTermDays: [],
  ltvReductionPoints: 0,
  reasonCodes: [],
};

const CALM_MARKET: MarketContext = {
  annualizedVol: 0.05,
  spreadPct: 0.01,
  phuQuyBuyPrice: 40_000,
  buybackStatus: "NORMAL",
};

describe("computeLiquidityFactor", () => {
  it("returns 1 for NORMAL, the configured factor for RESTRICTED/STOPPED", () => {
    expect(computeLiquidityFactor(DEFAULT_POLICY_CONFIG, "NORMAL")).toBe(1);
    expect(computeLiquidityFactor(DEFAULT_POLICY_CONFIG, "RESTRICTED")).toBe(DEFAULT_POLICY_CONFIG.liquidityFactor.restrictedBuyback);
    expect(computeLiquidityFactor(DEFAULT_POLICY_CONFIG, "STOPPED")).toBe(DEFAULT_POLICY_CONFIG.liquidityFactor.stoppedBuyback);
  });
});

describe("buildTermPolicies", () => {
  it("in a calm market, term_cap (not market_ltv_cap) is the binding constraint — matches DEFAULT_POLICY_CONFIG.termCaps exactly", () => {
    // With vol=5%/spread=1%, ES-based downside_haircut is dominated by the
    // policy floor (0.06 at 30d), giving market_ltv_cap ~0.885 — comfortably
    // above the 30d term cap of 0.6, so term_cap should win cleanly.
    const terms = buildTermPolicies(DEFAULT_POLICY_CONFIG, "NORMAL", NO_TRIGGERS, CALM_MARKET);
    const t30 = terms.find((t) => t.days === 30)!;
    expect(t30.ltvCap).toBeCloseTo(DEFAULT_POLICY_CONFIG.termCaps[30], 4);
    expect(t30.status).toBe("OPEN");
  });

  it("disables terms beyond the regime's max term days", () => {
    const terms = buildTermPolicies(DEFAULT_POLICY_CONFIG, "NORMAL", NO_TRIGGERS, CALM_MARKET);
    // NORMAL regime maxTermDays = 60 (section 8 table)
    expect(terms.find((t) => t.days === 60)!.status).toBe("OPEN");
    expect(terms.find((t) => t.days === 90)!.status).toBe("STOP");
    expect(terms.find((t) => t.days === 90)!.ltvCap).toBe(0);
  });

  it("CRISIS regime forces every term to STOP with 0% LTV", () => {
    const terms = buildTermPolicies(DEFAULT_POLICY_CONFIG, "CRISIS", NO_TRIGGERS, CALM_MARKET);
    for (const t of terms) {
      expect(t.status).toBe("STOP");
      expect(t.ltvCap).toBe(0);
    }
  });

  it("a forceStop hard trigger overrides every term to STOP regardless of regime", () => {
    const terms = buildTermPolicies(DEFAULT_POLICY_CONFIG, "LOW", { ...NO_TRIGGERS, forceStop: true }, CALM_MARKET);
    for (const t of terms) expect(t.status).toBe("STOP");
  });

  it("disabledTermDays from a hard trigger overrides just those specific terms", () => {
    const terms = buildTermPolicies(DEFAULT_POLICY_CONFIG, "NORMAL", { ...NO_TRIGGERS, disabledTermDays: [60, 90] }, CALM_MARKET);
    expect(terms.find((t) => t.days === 30)!.status).toBe("OPEN");
    expect(terms.find((t) => t.days === 60)!.status).toBe("STOP");
    expect(terms.find((t) => t.days === 90)!.status).toBe("STOP");
  });

  it("ltvReductionPoints subtracts directly from the capped LTV (10pt = 0.10)", () => {
    const base = buildTermPolicies(DEFAULT_POLICY_CONFIG, "NORMAL", NO_TRIGGERS, CALM_MARKET);
    const reduced = buildTermPolicies(DEFAULT_POLICY_CONFIG, "NORMAL", { ...NO_TRIGGERS, ltvReductionPoints: 10 }, CALM_MARKET);
    const t30base = base.find((t) => t.days === 30)!.ltvCap;
    const t30reduced = reduced.find((t) => t.days === 30)!.ltvCap;
    expect(t30base - t30reduced).toBeCloseTo(0.1, 4);
  });

  it("CAUTIOUS regime marks open terms as LIMITED, not OPEN (branch cannot self-approve)", () => {
    const terms = buildTermPolicies(DEFAULT_POLICY_CONFIG, "CAUTIOUS", NO_TRIGGERS, CALM_MARKET);
    expect(terms.find((t) => t.days === 7)!.status).toBe("LIMITED");
  });

  it("higher spread strictly reduces market_ltv_cap-bound terms (monotonicity)", () => {
    const highVolMarket: MarketContext = { ...CALM_MARKET, annualizedVol: 2.0 }; // extreme vol so market cap binds
    const lowSpread = buildTermPolicies(DEFAULT_POLICY_CONFIG, "NORMAL", NO_TRIGGERS, { ...highVolMarket, spreadPct: 0.01 });
    const highSpread = buildTermPolicies(DEFAULT_POLICY_CONFIG, "NORMAL", NO_TRIGGERS, { ...highVolMarket, spreadPct: 0.2 });
    const days90Low = lowSpread.find((t) => t.days === 7)!.ltvCap;
    const days90High = highSpread.find((t) => t.days === 7)!.ltvCap;
    expect(days90High).toBeLessThan(days90Low);
  });
});

function baseRequest(overrides: Partial<TransactionRequestInput> = {}): TransactionRequestInput {
  return {
    productCode: "PHU_QUY_SILVER_999",
    branchId: "HN01",
    assetId: "TEST-ASSET",
    weightGram: 250,
    purity: 1,
    sealStatus: "INTACT",
    serialVerified: true,
    requestedTermDays: 30,
    requestedAmount: 6_000_000,
    requestId: "test-request",
    ...overrides,
  };
}

const DECISION_CTX = {
  policy: DEFAULT_POLICY_CONFIG,
  regime: "NORMAL" as const,
  riskScore: 25,
  hardOutcome: NO_TRIGGERS,
  market: CALM_MARKET,
  modelVersion: "TEST-1.0",
  ruleVersion: "TEST-POLICY-1.0",
};

describe("computeDecision", () => {
  it("computes liquidation_value and max_loan exactly for a clean asset at the expected 30d term cap (0.6)", () => {
    const result = computeDecision(baseRequest(), DECISION_CTX);
    // liquidation_value = 40,000 * 250 * 1 (quality) * 1 (liquidity) = 10,000,000
    expect(result.liquidationValue).toBe(10_000_000);
    expect(result.approvedLtv).toBeCloseTo(0.6, 4);
    // max_loan = floor(10,000,000 * 0.6 / 100,000) * 100,000 = 6,000,000
    expect(result.maxLoan).toBe(6_000_000);
    expect(result.decision).toBe("APPROVE");
  });

  it("APPROVEs a request exactly at max_loan", () => {
    const result = computeDecision(baseRequest({ requestedAmount: 6_000_000 }), DECISION_CTX);
    expect(result.decision).toBe("APPROVE");
  });

  it("REFERs a request moderately over max_loan (within 5% tolerance)", () => {
    const result = computeDecision(baseRequest({ requestedAmount: 6_200_000 }), DECISION_CTX); // +3.3%
    expect(result.decision).toBe("REFER");
    expect(result.reasonCodes).toContain("REQUIRES_RISK_APPROVAL");
  });

  it("DECLINEs a request far over max_loan (beyond 20% tolerance)", () => {
    const result = computeDecision(baseRequest({ requestedAmount: 8_000_000 }), DECISION_CTX); // +33%
    expect(result.decision).toBe("DECLINE");
    expect(result.reasonCodes).toContain("AMOUNT_EXCEEDS_CAP");
  });

  it("reduces liquidation_value for a damaged seal and flags ASSET_QUALITY_HAIRCUT", () => {
    const clean = computeDecision(baseRequest(), DECISION_CTX);
    const damaged = computeDecision(baseRequest({ sealStatus: "DAMAGED" }), DECISION_CTX);
    expect(damaged.liquidationValue).toBeLessThan(clean.liquidationValue);
    expect(damaged.liquidationValue).toBe(Math.round(10_000_000 * DEFAULT_POLICY_CONFIG.assetQuality.damagedSealFactor));
    expect(damaged.reasonCodes).toContain("ASSET_QUALITY_HAIRCUT");
  });

  it("reduces liquidation_value for an unverified serial", () => {
    const result = computeDecision(baseRequest({ serialVerified: false }), DECISION_CTX);
    expect(result.liquidationValue).toBe(Math.round(10_000_000 * DEFAULT_POLICY_CONFIG.assetQuality.unverifiedSerialFactor));
    expect(result.reasonCodes).toContain("ASSET_QUALITY_HAIRCUT");
  });

  it("zeroes out liquidation_value when buyback is STOPPED (but that's normally caught by forceStop first)", () => {
    const ctx = { ...DECISION_CTX, market: { ...CALM_MARKET, buybackStatus: "STOPPED" as const } };
    const result = computeDecision(baseRequest(), ctx);
    expect(result.liquidationValue).toBe(0);
    expect(result.maxLoan).toBe(0);
  });

  it("returns STOP_NEW_LOANS with zeroed figures when a hard trigger forces stop, regardless of request size", () => {
    const ctx = { ...DECISION_CTX, hardOutcome: { ...NO_TRIGGERS, forceStop: true, reasonCodes: ["BUYBACK_NOT_NORMAL"] } };
    const result = computeDecision(baseRequest({ requestedAmount: 1 }), ctx);
    expect(result.decision).toBe("STOP_NEW_LOANS");
    expect(result.approvedLtv).toBe(0);
    expect(result.maxLoan).toBe(0);
  });

  it("DECLINEs with TERM_NOT_ALLOWED for a term the regime disables", () => {
    const result = computeDecision(baseRequest({ requestedTermDays: 90 }), DECISION_CTX); // NORMAL maxTermDays=60
    expect(result.decision).toBe("DECLINE");
    expect(result.reasonCodes).toContain("TERM_NOT_ALLOWED");
  });

  it("always REFERs (never auto-APPROVEs) in a CAUTIOUS/LIMITED regime even when comfortably within cap", () => {
    const ctx = { ...DECISION_CTX, regime: "CAUTIOUS" as const };
    const result = computeDecision(baseRequest({ requestedTermDays: 7, requestedAmount: 1 }), ctx);
    expect(result.decision).toBe("REFER");
  });

  it("sets expiresAt in the future by roughly the configured TTL", () => {
    const before = Date.now();
    const result = computeDecision(baseRequest(), { ...DECISION_CTX, decisionTtlMinutes: 15 });
    const diffMinutes = (result.expiresAt.getTime() - before) / 60_000;
    expect(diffMinutes).toBeGreaterThan(14);
    expect(diffMinutes).toBeLessThanOrEqual(15.1);
  });
});
