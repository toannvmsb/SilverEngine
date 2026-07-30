import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/apiAuth";
import { CAN_VIEW_AUDIT } from "@/lib/roles";
import {
  computeDecision,
  computeRiskScore,
  evaluateHardTriggers,
  regimeFromScore,
  combineRegime,
  DEFAULT_POLICY_CONFIG,
  RULE_SET_NAME,
  PolicyConfig,
} from "@/lib/engine";
import { toHardTriggerContext, toRiskScoreInputs, MarketFeatureFormData } from "@/lib/featureSnapshot";

// Section 15 "Replay" test + section 2 "Idempotent and replayable": re-run the
// engine against the exact input snapshot stored with the original decision,
// using the exact rule-set version that was active at decision time, and
// confirm the output reproduces bit-for-bit.
export async function POST(_req: Request, { params }: { params: { decisionId: string } }) {
  const auth = await requireRole(CAN_VIEW_AUDIT);
  if ("error" in auth) return auth.error;

  const log = await prisma.decisionLog.findUnique({ where: { decisionId: params.decisionId } });
  if (!log) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const snapshot = JSON.parse(log.inputsSnapshot) as {
    request: {
      product_code: string;
      branch_id: string;
      asset_id: string;
      weight_gram: number;
      purity: number;
      seal_status: "INTACT" | "DAMAGED";
      serial_verified: boolean;
      customer_segment?: string;
      requested_term_days: number;
      requested_amount: number;
      request_id: string;
    };
    feature: MarketFeatureFormData;
    quote: { buyPrice: number; sellPrice: number; buybackStatus: "NORMAL" | "RESTRICTED" | "STOPPED"; sourceTime: string };
  };

  const ruleEntry = await prisma.ruleRegistryEntry.findFirst({
    where: { ruleSetName: RULE_SET_NAME, version: log.policyVersion },
  });
  const policy: PolicyConfig = ruleEntry ? JSON.parse(ruleEntry.content) : DEFAULT_POLICY_CONFIG;

  const riskInputs = toRiskScoreInputs(snapshot.feature);
  const riskResult = computeRiskScore(riskInputs);
  const quoteAgeMinutes = (Date.now() - new Date(snapshot.quote.sourceTime).getTime()) / 60000;
  const hardCtx = toHardTriggerContext(snapshot.feature, quoteAgeMinutes, null);
  const hardOutcome = evaluateHardTriggers(hardCtx);
  const regime = combineRegime(regimeFromScore(riskResult.score), hardOutcome.regimeFloor);

  const market = {
    annualizedVol: snapshot.feature.ewmaVol,
    spreadPct: (snapshot.quote.sellPrice - snapshot.quote.buyPrice) / snapshot.quote.buyPrice,
    phuQuyBuyPrice: snapshot.quote.buyPrice,
    buybackStatus: snapshot.quote.buybackStatus,
  };

  const replayed = computeDecision(
    {
      productCode: snapshot.request.product_code,
      branchId: snapshot.request.branch_id,
      assetId: snapshot.request.asset_id,
      weightGram: snapshot.request.weight_gram,
      purity: snapshot.request.purity,
      sealStatus: snapshot.request.seal_status,
      serialVerified: snapshot.request.serial_verified,
      customerSegment: snapshot.request.customer_segment,
      requestedTermDays: snapshot.request.requested_term_days,
      requestedAmount: snapshot.request.requested_amount,
      requestId: snapshot.request.request_id,
    },
    {
      policy,
      regime,
      riskScore: riskResult.score,
      hardOutcome,
      market,
      modelVersion: log.modelVersion,
      ruleVersion: log.ruleVersion,
      decisionTtlMinutes: 15,
    }
  );

  const matches =
    replayed.decision === log.decision &&
    replayed.approvedLtv === log.approvedLtv &&
    replayed.maxLoan === log.maxLoan &&
    replayed.interestRateApr === log.interestRateApr;

  return NextResponse.json({
    matches,
    original: {
      decision: log.decision,
      approvedLtv: log.approvedLtv,
      maxLoan: log.maxLoan,
      interestRateApr: log.interestRateApr,
    },
    replayed: {
      decision: replayed.decision,
      approvedLtv: replayed.approvedLtv,
      maxLoan: replayed.maxLoan,
      interestRateApr: replayed.interestRateApr,
    },
  });
}
