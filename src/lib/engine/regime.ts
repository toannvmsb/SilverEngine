import { REGIME_TABLE } from "./constants";
import { HardTriggerContext, HardTriggerOutcome, Regime, REGIME_ORDER } from "./types";

export function regimeFromScore(score: number): Regime {
  for (const regime of REGIME_ORDER) {
    const bucket = REGIME_TABLE[regime];
    if (score >= bucket.scoreMin && score <= bucket.scoreMax) return regime;
  }
  return "CRISIS";
}

function regimeRank(r: Regime): number {
  return REGIME_ORDER.indexOf(r);
}

/** final_regime = max(regime_from_score, regime_from_hard_triggers) — never de-escalates. */
export function combineRegime(fromScore: Regime, floor: Regime | null): Regime {
  if (!floor) return fromScore;
  return regimeRank(floor) > regimeRank(fromScore) ? floor : fromScore;
}

/**
 * Section 8 "Hard trigger" table + 18.2 sample rule config.
 * Hard rules can only escalate risk (reduce LTV, disable terms, stop lending) —
 * they never override a model into looking safer than it is (per "Model + Rule"
 * design principle in section 2).
 */
export function evaluateHardTriggers(ctx: HardTriggerContext): HardTriggerOutcome {
  const reasonCodes: string[] = [];
  let forceStop = false;
  let regimeFloor: Regime | null = null;
  const disabledTermDays: number[] = [];
  let ltvReductionPoints = 0;

  if (ctx.buybackStatus !== "NORMAL") {
    forceStop = true;
    regimeFloor = "CRISIS";
    reasonCodes.push("BUYBACK_NOT_NORMAL", "STOP_LENDING");
  }

  if (ctx.phuquyQuoteAgeMinutes > 30) {
    forceStop = true;
    regimeFloor = "CRISIS";
    reasonCodes.push("DATA_STALE_CRITICAL", "STOP_LENDING");
  }

  if (ctx.drawdown30d <= -0.25) {
    // STOP hoặc chỉ 7 ngày theo phê duyệt Risk — MVP default: force STOP,
    // a Risk Approver can override via the maker-checker REFER path.
    forceStop = true;
    regimeFloor = combineRegime(regimeFloor ?? "LOW", "STRESS");
    reasonCodes.push("DRAWDOWN_30D_HIGH", "STOP_LENDING");
  } else if (ctx.drawdown10d <= -0.15) {
    disabledTermDays.push(60, 90);
    ltvReductionPoints = Math.max(ltvReductionPoints, 10);
    regimeFloor = combineRegime(regimeFloor ?? "LOW", "HIGH");
    reasonCodes.push("DRAWDOWN_10D_HIGH");
  }

  if (ctx.spreadPct > 0.07) {
    ltvReductionPoints = Math.max(ltvReductionPoints, 10);
    reasonCodes.push("SPREAD_ABOVE_NORMAL");
  }

  if (ctx.criticalSourceUnavailable) {
    forceStop = true;
    regimeFloor = "CRISIS";
    reasonCodes.push("DATA_STALE_CRITICAL", "DEFENSIVE_MODE", "STOP_LENDING");
  }

  if (!ctx.modelServiceHealthy) {
    forceStop = true;
    regimeFloor = combineRegime(regimeFloor ?? "LOW", "STRESS");
    reasonCodes.push("DEFENSIVE_MODE", "STOP_LENDING");
  }

  if (ctx.portfolioStressLtv20 !== null && ctx.portfolioStressLtv20 > 0.8) {
    disabledTermDays.push(60, 90);
    ltvReductionPoints = Math.max(ltvReductionPoints, 10);
    reasonCodes.push("PORTFOLIO_CONCENTRATION");
  }

  return {
    forceStop,
    regimeFloor,
    disabledTermDays: Array.from(new Set(disabledTermDays)).sort((a, b) => a - b),
    ltvReductionPoints,
    reasonCodes: Array.from(new Set(reasonCodes)),
  };
}
