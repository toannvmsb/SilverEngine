import { REGIME_TABLE, REGIME_TERM_STATUS } from "./constants";
import { expectedPriceHaircut, parametricEwmaES } from "./expectedShortfall";
import { computeInterestRateApr } from "./interestEngine";
import {
  BuybackStatus,
  DecisionResult,
  DecisionState,
  HardTriggerOutcome,
  PolicyConfig,
  Regime,
  TermPolicy,
  TransactionRequestInput,
} from "./types";

const ES_TAIL_Q = 0.01; // section 7.2: "ES dùng tail 1% hoặc 2,5%" — MVP default 1%
const REFER_TOLERANCE = 1.05; // requested amount up to 5% over cap -> REFER instead of DECLINE
const DECLINE_TOLERANCE = 1.2; // beyond 20% over cap -> always DECLINE, no discretion

export interface MarketContext {
  annualizedVol: number; // EWMA vol used to drive the ES haircut
  spreadPct: number;
  phuQuyBuyPrice: number; // VND per gram, buyback price
  buybackStatus: BuybackStatus;
}

/**
 * Section 8 master formula, evaluated per standard term:
 *   liquidation_value  = buyback_price * eligible_weight * quality_factor * liquidity_factor
 *   market_ltv_cap      = (1-downside_haircut)*(1-spread_buffer)*(1-liquidation_cost)*(1-safety_buffer)
 *   final_ltv           = min(market_ltv_cap, term_cap, ..., global_cap) - hard_trigger_reduction
 */
export function buildTermPolicies(
  policy: PolicyConfig,
  regime: Regime,
  hardOutcome: HardTriggerOutcome,
  market: MarketContext
): TermPolicy[] {
  const regimeMaxTermDays = REGIME_TABLE[regime].maxTermDays;
  const baseStatus = REGIME_TERM_STATUS[regime];
  const ltvReduction = hardOutcome.ltvReductionPoints / 100;

  return policy.standardTerms.map((days) => {
    const es = parametricEwmaES(market.annualizedVol, days, ES_TAIL_Q);
    const downsideHaircut = expectedPriceHaircut(es, policy.policyFloorHaircut[days] ?? 0);
    const marketLtvCap =
      (1 - downsideHaircut) *
      (1 - policy.spreadBufferMultiplier * market.spreadPct) *
      (1 - policy.liquidationCostPct) *
      (1 - policy.safetyBufferPct);

    const termCapBase = policy.termCaps[days] ?? 0;
    const disabledByRegime = days > regimeMaxTermDays;
    const disabledByHardTrigger = hardOutcome.disabledTermDays.includes(days);

    let status: TermPolicy["status"];
    if (hardOutcome.forceStop || disabledByRegime || disabledByHardTrigger) {
      status = "STOP";
    } else {
      status = baseStatus;
    }

    const rawCap = Math.min(marketLtvCap, termCapBase, policy.globalLtvCap);
    const ltvCap = status === "STOP" ? 0 : Math.max(0, round4(rawCap - ltvReduction));

    return { days, ltvCap, status };
  });
}

/** Market-wide (not asset-specific) buyback-restriction haircut — shared by
 * computeDecision and the reference-price display on the Executive/Policy
 * dashboards, so the two never drift apart. */
export function computeLiquidityFactor(policy: PolicyConfig, buybackStatus: BuybackStatus): number {
  if (buybackStatus === "STOPPED") return policy.liquidityFactor.stoppedBuyback;
  if (buybackStatus === "RESTRICTED") return policy.liquidityFactor.restrictedBuyback;
  return 1;
}

export function computeDecision(
  input: TransactionRequestInput,
  ctx: {
    policy: PolicyConfig;
    regime: Regime;
    riskScore: number;
    hardOutcome: HardTriggerOutcome;
    market: MarketContext;
    modelVersion: string;
    ruleVersion: string;
    decisionTtlMinutes?: number;
  }
): DecisionResult {
  const { policy, regime, riskScore, hardOutcome, market } = ctx;
  const termPolicies = buildTermPolicies(policy, regime, hardOutcome, market);
  const reasonCodes = new Set(hardOutcome.reasonCodes);
  const expiresAt = new Date(Date.now() + (ctx.decisionTtlMinutes ?? 15) * 60_000);
  const maxTermDays = Math.max(0, ...termPolicies.filter((t) => t.status !== "STOP").map((t) => t.days));

  const base = {
    regime,
    riskScore,
    policyVersion: policy.policyVersion,
    modelVersion: ctx.modelVersion,
    ruleVersion: ctx.ruleVersion,
    expiresAt,
  };

  if (hardOutcome.forceStop) {
    reasonCodes.add("STOP_LENDING");
    return {
      ...base,
      decision: "STOP_NEW_LOANS",
      approvedLtv: 0,
      maxLoan: 0,
      maxTermDays: 0,
      interestRateApr: 0,
      liquidationValue: 0,
      reasonCodes: Array.from(reasonCodes),
    };
  }

  const termEntry = termPolicies.find((t) => t.days === input.requestedTermDays);
  if (!termEntry || termEntry.status === "STOP") {
    reasonCodes.add("TERM_NOT_ALLOWED");
    return {
      ...base,
      decision: "DECLINE",
      approvedLtv: 0,
      maxLoan: 0,
      maxTermDays,
      interestRateApr: 0,
      liquidationValue: 0,
      reasonCodes: Array.from(reasonCodes),
    };
  }

  const eligibleWeight = input.weightGram * input.purity;
  let qualityFactor = 1;
  if (input.sealStatus === "DAMAGED") {
    qualityFactor *= policy.assetQuality.damagedSealFactor;
    reasonCodes.add("ASSET_QUALITY_HAIRCUT");
  }
  if (!input.serialVerified) {
    qualityFactor *= policy.assetQuality.unverifiedSerialFactor;
    reasonCodes.add("ASSET_QUALITY_HAIRCUT");
  }
  const liquidityFactor = computeLiquidityFactor(policy, market.buybackStatus);

  const liquidationValue = market.phuQuyBuyPrice * eligibleWeight * qualityFactor * liquidityFactor;
  const finalLtv = termEntry.ltvCap;
  const maxLoanRaw = liquidationValue * finalLtv;
  const maxLoan = Math.floor(maxLoanRaw / policy.policyRoundingUnit) * policy.policyRoundingUnit;
  const interestRateApr = computeInterestRateApr(policy, regime, riskScore, input.requestedTermDays);

  let decision: DecisionState;
  if (input.requestedAmount > maxLoan * DECLINE_TOLERANCE) {
    decision = "DECLINE";
    reasonCodes.add("AMOUNT_EXCEEDS_CAP");
  } else if (termEntry.status === "OPEN") {
    if (input.requestedAmount <= maxLoan) {
      decision = "APPROVE";
    } else if (input.requestedAmount <= maxLoan * REFER_TOLERANCE) {
      decision = "REFER";
      reasonCodes.add("AMOUNT_EXCEEDS_CAP");
      reasonCodes.add("REQUIRES_RISK_APPROVAL");
    } else {
      decision = "DECLINE";
      reasonCodes.add("AMOUNT_EXCEEDS_CAP");
    }
  } else {
    // LIMITED / REFER term status -> branch can never self-approve (section 8.1)
    decision = "REFER";
    reasonCodes.add("REQUIRES_RISK_APPROVAL");
    if (input.requestedAmount > maxLoan) reasonCodes.add("AMOUNT_EXCEEDS_CAP");
  }

  return {
    ...base,
    decision,
    approvedLtv: finalLtv,
    maxLoan,
    maxTermDays,
    interestRateApr,
    liquidationValue: round0(liquidationValue),
    reasonCodes: Array.from(reasonCodes),
  };
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
function round0(x: number): number {
  return Math.round(x);
}
