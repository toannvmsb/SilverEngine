import { prisma } from "@/lib/db";
import {
  buildTermPolicies,
  computeRiskScore,
  combineRegime,
  evaluateHardTriggers,
  regimeFromScore,
  MODEL_VERSION,
} from "@/lib/engine";
import { getActivePolicyConfig } from "@/lib/policyStore";
import {
  MarketFeatureFormData,
  toHardTriggerContext,
  toRiskScoreInputs,
} from "@/lib/featureSnapshot";
import { createAlert } from "@/lib/alerts/createAlert";
import { Regime, HardTriggerOutcome } from "@/lib/engine";

export async function getLatestFeatureSnapshot(): Promise<
  { data: MarketFeatureFormData; asOf: Date } | null
> {
  const row = await prisma.featureSnapshot.findFirst({ orderBy: { asOf: "desc" } });
  if (!row) return null;
  return { data: JSON.parse(row.features) as MarketFeatureFormData, asOf: row.asOf };
}

export async function getLatestPhuQuyQuote() {
  return prisma.phuQuyQuote.findFirst({ orderBy: { sourceTime: "desc" } });
}

export async function getPortfolioStressLtv20(): Promise<number | null> {
  const contracts = await prisma.portfolioContract.findMany({ where: { status: "ACTIVE" } });
  if (contracts.length === 0) return null;
  const latestValuations = await Promise.all(
    contracts.map((c) =>
      prisma.portfolioValuation.findFirst({
        where: { contractId: c.contractId },
        orderBy: { asOf: "desc" },
      })
    )
  );
  const values = latestValuations.filter((v): v is NonNullable<typeof v> => v !== null);
  if (values.length === 0) return null;
  return Math.max(...values.map((v) => v.stressedLtv20));
}

/**
 * Runs the "pipeline" (feature -> risk model -> decision/rule engine, section 3)
 * against the most recently saved feature snapshot + Phu Quy quote, then
 * persists a new RiskSnapshot + PolicySnapshot — this is the "publish" step
 * that GET /v1/policies/current reads from.
 */
export async function runPipeline(enteredBy?: string) {
  const feature = await getLatestFeatureSnapshot();
  const quote = await getLatestPhuQuyQuote();
  if (!feature || !quote) {
    throw new Error("Chưa có dữ liệu thị trường (feature snapshot / Phu Quy quote) để tính chính sách.");
  }

  const { config: policy, version: policyVersion } = await getActivePolicyConfig();
  const riskInputs = toRiskScoreInputs(feature.data);
  const riskResult = computeRiskScore(riskInputs);

  const quoteAgeMinutes = (Date.now() - quote.sourceTime.getTime()) / 60000;
  const portfolioStressLtv20 = await getPortfolioStressLtv20();
  const hardCtx = toHardTriggerContext(feature.data, quoteAgeMinutes, portfolioStressLtv20);
  const hardOutcome = evaluateHardTriggers(hardCtx);

  const scoreRegime = regimeFromScore(riskResult.score);
  const regime = combineRegime(scoreRegime, hardOutcome.regimeFloor);

  await raiseSystemAlerts(regime, hardOutcome);

  const market = {
    annualizedVol: feature.data.ewmaVol,
    spreadPct: (quote.sellPrice - quote.buyPrice) / quote.buyPrice,
    phuQuyBuyPrice: quote.buyPrice,
    buybackStatus: quote.buybackStatus as "NORMAL" | "RESTRICTED" | "STOPPED",
  };

  const terms = buildTermPolicies(policy, regime, hardOutcome, market);

  const dataQualityScore = Math.min(100, Math.max(0, Math.round(100 - quoteAgeMinutes * 2)));

  const riskSnapshot = await prisma.riskSnapshot.create({
    data: {
      score: riskResult.score,
      regime,
      components: JSON.stringify(riskResult.components),
      esByHorizon: JSON.stringify(terms),
      modelVersion: MODEL_VERSION,
      reasonCodes: JSON.stringify(hardOutcome.reasonCodes),
    },
  });

  const policySnapshot = await prisma.policySnapshot.create({
    data: {
      productCode: "PHU_QUY_SILVER_999",
      branchId: "HN01",
      riskSnapshotId: riskSnapshot.id,
      regime,
      riskScore: riskResult.score,
      dataQualityScore,
      terms: JSON.stringify(terms),
      reasonCodes: JSON.stringify(hardOutcome.reasonCodes),
      policyVersion,
      modelVersion: MODEL_VERSION,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorService: "pipeline",
      action: "PIPELINE_RUN",
      afterJson: JSON.stringify({ riskSnapshotId: riskSnapshot.id, policySnapshotId: policySnapshot.id, regime, score: riskResult.score }),
      correlationId: policySnapshot.id,
    },
  });

  return { riskSnapshot, policySnapshot, terms, regime, riskResult, hardOutcome, policy, policyVersion, market, quoteAgeMinutes, dataQualityScore };
}

/**
 * Section 12 alert levels applied to system-wide (non-portfolio-specific)
 * events: a hard trigger forcing STOP, or the regime itself reaching
 * STRESS/CRISIS purely from the score.
 */
async function raiseSystemAlerts(regime: Regime, hardOutcome: HardTriggerOutcome): Promise<void> {
  if (hardOutcome.forceStop || regime === "CRISIS") {
    await createAlert({
      level: "CRITICAL",
      category: "SYSTEM",
      message: `STOP_NEW_LOANS — regime=${regime}, reason_codes=${hardOutcome.reasonCodes.join(", ") || "score-based CRISIS"}`,
      context: { regime, reasonCodes: hardOutcome.reasonCodes },
    });
  } else if (regime === "STRESS") {
    await createAlert({
      level: "HIGH",
      category: "SYSTEM",
      message: `Regime chuyển sang STRESS — reason_codes=${hardOutcome.reasonCodes.join(", ") || "score-based"}`,
      context: { regime, reasonCodes: hardOutcome.reasonCodes },
    });
  }
}
