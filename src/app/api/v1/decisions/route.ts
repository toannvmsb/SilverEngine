import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { computeDecision, RULE_SET_NAME } from "@/lib/engine";
import { getLatestFeatureSnapshot, getLatestPhuQuyQuote, getPortfolioStressLtv20 } from "@/lib/pipeline";
import { toRiskScoreInputs, toHardTriggerContext } from "@/lib/featureSnapshot";
import { computeRiskScore, evaluateHardTriggers, regimeFromScore, combineRegime, MODEL_VERSION } from "@/lib/engine";
import { getActivePolicyConfig } from "@/lib/policyStore";
import { requireRole } from "@/lib/apiAuth";
import { CAN_SUBMIT_TRANSACTIONS } from "@/lib/roles";

// Section 10.2 Transaction decision API
const decisionRequestSchema = z.object({
  product_code: z.string().default("PHU_QUY_SILVER_999"),
  branch_id: z.string(),
  asset_id: z.string(),
  weight_gram: z.coerce.number().positive(),
  purity: z.coerce.number().min(0).max(1).default(0.999),
  seal_status: z.enum(["INTACT", "DAMAGED"]).default("INTACT"),
  serial_verified: z.coerce.boolean().default(true),
  customer_segment: z.string().optional(),
  requested_term_days: z.coerce.number().int().positive(),
  requested_amount: z.coerce.number().positive(),
  request_id: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(CAN_SUBMIT_TRANSACTIONS);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = decisionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, { status: 400 });
  }
  const r = parsed.data;
  const payloadHash = createHash("sha256").update(JSON.stringify(r)).digest("hex");

  // Idempotency: same request_id + same payload -> return prior decision;
  // same request_id + different payload -> 409 (section 10.3).
  const existing = await prisma.decisionLog.findUnique({ where: { requestId: r.request_id } });
  if (existing) {
    if (existing.inputsHash !== payloadHash) {
      return NextResponse.json({ error: "IDEMPOTENCY_KEY_CONFLICT" }, { status: 409 });
    }
    return NextResponse.json(toDecisionResponse(existing));
  }

  const feature = await getLatestFeatureSnapshot();
  const quote = await getLatestPhuQuyQuote();
  if (!feature || !quote) {
    return NextResponse.json(
      { error: "NO_MARKET_DATA", message: "Chưa có dữ liệu thị trường — không thể ra quyết định." },
      { status: 503 }
    );
  }
  const { config: policy, version: policyVersion } = await getActivePolicyConfig();
  const riskInputs = toRiskScoreInputs(feature.data);
  const riskResult = computeRiskScore(riskInputs);
  const quoteAgeMinutes = (Date.now() - quote.sourceTime.getTime()) / 60000;
  const portfolioStressLtv20 = await getPortfolioStressLtv20();
  const hardCtx = toHardTriggerContext(feature.data, quoteAgeMinutes, portfolioStressLtv20);
  const hardOutcome = evaluateHardTriggers(hardCtx);
  const regime = combineRegime(regimeFromScore(riskResult.score), hardOutcome.regimeFloor);

  const market = {
    annualizedVol: feature.data.ewmaVol,
    spreadPct: (quote.sellPrice - quote.buyPrice) / quote.buyPrice,
    phuQuyBuyPrice: quote.buyPrice,
    buybackStatus: quote.buybackStatus as "NORMAL" | "RESTRICTED" | "STOPPED",
  };

  const decision = computeDecision(
    {
      productCode: r.product_code,
      branchId: r.branch_id,
      assetId: r.asset_id,
      weightGram: r.weight_gram,
      purity: r.purity,
      sealStatus: r.seal_status,
      serialVerified: r.serial_verified,
      customerSegment: r.customer_segment,
      requestedTermDays: r.requested_term_days,
      requestedAmount: r.requested_amount,
      requestId: r.request_id,
    },
    {
      policy,
      regime,
      riskScore: riskResult.score,
      hardOutcome,
      market,
      modelVersion: MODEL_VERSION,
      ruleVersion: `${RULE_SET_NAME}@${policyVersion}`,
    }
  );

  const log = await prisma.decisionLog.create({
    data: {
      requestId: r.request_id,
      productCode: r.product_code,
      branchId: r.branch_id,
      assetId: r.asset_id,
      weightGram: r.weight_gram,
      sealStatus: r.seal_status,
      serialVerified: r.serial_verified,
      customerSegment: r.customer_segment,
      requestedTermDays: r.requested_term_days,
      requestedAmount: r.requested_amount,
      inputsSnapshot: JSON.stringify({ request: r, feature: feature.data, quote, regime, riskScore: riskResult.score }),
      inputsHash: payloadHash,
      decision: decision.decision,
      approvedLtv: decision.approvedLtv,
      maxLoan: decision.maxLoan,
      maxTermDays: decision.maxTermDays,
      interestRateApr: decision.interestRateApr,
      liquidationValue: decision.liquidationValue,
      reasonCodes: JSON.stringify(decision.reasonCodes),
      policyVersion: decision.policyVersion,
      modelVersion: decision.modelVersion,
      ruleVersion: decision.ruleVersion,
      expiresAt: decision.expiresAt,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: auth.session.user.id,
      action: "DECISION_CREATED",
      afterJson: JSON.stringify({ decisionId: log.decisionId, decision: decision.decision }),
      correlationId: log.decisionId,
    },
  });

  return NextResponse.json(toDecisionResponse(log));
}

function toDecisionResponse(log: {
  decisionId: string;
  decision: string;
  approvedLtv: number;
  maxLoan: number;
  maxTermDays: number;
  liquidationValue: number;
  reasonCodes: string;
  policyVersion: string;
  modelVersion: string;
  expiresAt: Date;
  interestRateApr: number;
}) {
  return {
    decision_id: log.decisionId,
    decision: log.decision,
    approved_ltv: log.approvedLtv,
    max_loan: log.maxLoan,
    max_term_days: log.maxTermDays,
    interest_rate_apr_pct: log.interestRateApr,
    liquidation_value: log.liquidationValue,
    reason_codes: JSON.parse(log.reasonCodes),
    policy_version: log.policyVersion,
    model_version: log.modelVersion,
    expires_at: log.expiresAt.toISOString(),
  };
}
