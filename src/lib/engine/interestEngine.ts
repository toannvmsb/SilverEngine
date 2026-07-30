import { PolicyConfig, Regime } from "./types";

/**
 * Risk-based interest pricing (not specified in the source doc, which only
 * covers LTV/regime policy — added per product decision to price rate as
 * base + term + regime + risk-score premia, all policy-configurable).
 *
 *   apr = base + termDays * termPremiumPctPerDay
 *             + regimePremiumPct[regime]
 *             + (score/100) * maxScorePremiumPct
 *   apr = clamp(apr, minAprPct, maxAprPct)
 */
export function computeInterestRateApr(
  policy: PolicyConfig,
  regime: Regime,
  riskScore: number,
  termDays: number
): number {
  const { interest } = policy;
  const raw =
    interest.baseAprPct +
    termDays * interest.termPremiumPctPerDay +
    interest.regimePremiumPct[regime] +
    (riskScore / 100) * interest.maxScorePremiumPct;
  const clamped = Math.min(interest.maxAprPct, Math.max(interest.minAprPct, raw));
  return Math.round(clamped * 100) / 100;
}
