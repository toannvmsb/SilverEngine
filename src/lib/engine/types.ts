// Shared types for the SilverGuard risk/decision engine.
// Mirrors the data contracts in "Tai_Lieu_Ky_Thuat_SilverGuard_Risk_Engine_v1.0"
// sections 6-10.

export type Regime = "LOW" | "NORMAL" | "CAUTIOUS" | "HIGH" | "STRESS" | "CRISIS";

export const REGIME_ORDER: Regime[] = ["LOW", "NORMAL", "CAUTIOUS", "HIGH", "STRESS", "CRISIS"];

export type TermStatus = "OPEN" | "LIMITED" | "REFER" | "STOP";

export type DecisionState = "APPROVE" | "REFER" | "DECLINE" | "STOP_NEW_LOANS";

export type BuybackStatus = "NORMAL" | "RESTRICTED" | "STOPPED";

export interface PriceVolInputs {
  /** Annualized realized volatility, 30d window, decimal (0.22 = 22%) */
  vol30d: number;
  /** Annualized realized volatility, 90d window, decimal */
  vol90d: number;
  /** EWMA (fast-reacting) annualized volatility, decimal */
  ewmaVol: number;
  /** Drawdown from 20d high, decimal, negative (e.g. -0.08) */
  drawdown20d: number;
  /** Drawdown from 60d high, decimal, negative */
  drawdown60d: number;
}

export interface MacroInputs {
  /** DXY % change over 20 trading days, decimal (0.03 = +3%) */
  dxyChange20d: number;
  /** US 10Y real yield, decimal (0.018 = 1.8%) */
  realYield10y: number;
  /** ISM/PMI manufacturing index level (50 = neutral) */
  pmi: number;
}

export interface PositioningInputs {
  /** CFTC managed-money net-long percentile vs trailing history, 0-100 */
  cotNetLongPercentile: number;
  /** Week-over-week open interest shock, decimal absolute change (0.15 = 15%) */
  oiShockPct: number;
}

export interface LiquidityInputs {
  /** Phu Quy buy/sell spread, decimal (0.03 = 3%) */
  spreadPct: number;
  buybackStatus: BuybackStatus;
  /** Divergence between local Phu Quy price move and international silver move, decimal */
  priceDivergencePct: number;
  /** Estimated days required to fully liquidate collateral at current buyback pace */
  liquidationDays: number;
}

export interface EventInputs {
  hoursToNextEvent: number;
  eventSeverity: "LOW" | "MEDIUM" | "HIGH";
}

export interface RiskScoreInputs {
  priceVol: PriceVolInputs;
  macro: MacroInputs;
  positioning: PositioningInputs;
  liquidity: LiquidityInputs;
  event: EventInputs;
}

export interface RiskScoreComponents {
  priceVol: number;
  macro: number;
  positioning: number;
  liquidity: number;
  event: number;
}

export interface RiskScoreResult {
  score: number; // 0-100
  components: RiskScoreComponents;
}

export interface HardTriggerContext {
  buybackStatus: BuybackStatus;
  phuquyQuoteAgeMinutes: number;
  drawdown10d: number; // decimal, negative
  drawdown30d: number; // decimal, negative
  spreadPct: number; // decimal
  criticalSourceUnavailable: boolean;
  modelServiceHealthy: boolean;
  portfolioStressLtv20: number | null; // decimal, stressed LTV at -20% shock, null if unknown
}

export interface HardTriggerOutcome {
  forceStop: boolean;
  regimeFloor: Regime | null;
  disabledTermDays: number[];
  ltvReductionPoints: number; // percentage points, e.g. 10 = -10pt
  reasonCodes: string[];
}

export interface TermPolicy {
  days: number;
  ltvCap: number; // decimal
  status: TermStatus;
}

export interface PolicyConfig {
  policyVersion: string;
  globalLtvCap: number; // decimal
  termCaps: Record<number, number>; // days -> decimal cap (upper bound of regime range)
  standardTerms: number[]; // e.g. [7,14,30,60,90]
  spreadBufferMultiplier: number; // scales spreadPct into market_ltv_cap haircut
  liquidationCostPct: number; // decimal
  safetyBufferPct: number; // decimal
  policyFloorHaircut: Record<number, number>; // days -> minimum downside haircut decimal
  policyRoundingUnit: number; // VND, e.g. 100000
  assetQuality: {
    damagedSealFactor: number;
    unverifiedSerialFactor: number;
  };
  liquidityFactor: {
    restrictedBuyback: number;
    stoppedBuyback: number;
  };
  interest: {
    baseAprPct: number; // e.g. 18 (=18%/year)
    termPremiumPctPerDay: number; // small per-day-of-term premium contribution
    regimePremiumPct: Record<Regime, number>;
    maxScorePremiumPct: number;
    minAprPct: number;
    maxAprPct: number; // configurable compliance ceiling — confirm with Legal before production use
  };
}

export interface ExpectedShortfallResult {
  horizonDays: number;
  varQ: number; // decimal, negative
  esQ: number; // decimal, negative
  method: "historical_simulation" | "parametric_ewma";
}

export interface TransactionRequestInput {
  productCode: string;
  branchId: string;
  assetId: string;
  weightGram: number;
  purity: number; // decimal, e.g. 0.999
  sealStatus: "INTACT" | "DAMAGED";
  serialVerified: boolean;
  customerSegment?: string;
  requestedTermDays: number;
  requestedAmount: number;
  requestId: string;
}

export interface DecisionResult {
  decision: DecisionState;
  approvedLtv: number;
  maxLoan: number;
  maxTermDays: number;
  interestRateApr: number;
  liquidationValue: number;
  reasonCodes: string[];
  regime: Regime;
  riskScore: number;
  policyVersion: string;
  modelVersion: string;
  ruleVersion: string;
  expiresAt: Date;
}
