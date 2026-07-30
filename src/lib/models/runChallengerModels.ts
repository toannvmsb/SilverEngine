import { prisma } from "@/lib/db";
import { loadDailySeries, logReturns } from "@/lib/ingestion/computeFeaturesFromHistory";
import { fitGjrGarch, forecastGjrGarchVol } from "./gjrGarch";
import { computeConditionalQuantiles } from "./conditionalQuantiles";
import { getLatestFeatureSnapshot } from "@/lib/pipeline";

const HORIZONS = [7, 14, 30, 60, 90];
const SILVER_SYMBOL = "SILVER_SPOT_USD";

export interface ChallengerRunSummary {
  gjrGarch: { ran: boolean; reason?: string; version?: string };
  conditionalQuantiles: { ran: boolean; reason?: string; version?: string };
}

/**
 * Fits both challenger models against accumulated silver price history and
 * registers the results in model_registry with is_champion=false. Manual/
 * on-demand (Model Governance page) rather than part of the ingestion loop —
 * fitting is heavier than a simple feature refresh and, per section 14, model
 * promotion is a deliberate governance action, not something that should
 * happen silently every few minutes.
 */
export async function runChallengerModels(triggeredBy: string): Promise<ChallengerRunSummary> {
  const series = await loadDailySeries(SILVER_SYMBOL, 500);
  const prices = series.map((s) => s.price);
  const returns = logReturns(prices);
  const version = `run-${new Date().toISOString()}`;

  const summary: ChallengerRunSummary = {
    gjrGarch: { ran: false },
    conditionalQuantiles: { ran: false },
  };

  const feature = await getLatestFeatureSnapshot();
  const ewmaVol = feature?.data.ewmaVol ?? null;

  const gjrFit = fitGjrGarch(returns);
  if (!gjrFit) {
    summary.gjrGarch = { ran: false, reason: `Cần >=40 ngày lịch sử giá ${SILVER_SYMBOL}, hiện có ${returns.length}.` };
  } else {
    const forecastByHorizon = Object.fromEntries(
      HORIZONS.map((h) => [h, forecastGjrGarchVol(gjrFit, returns, h)])
    );
    const championByHorizon = Object.fromEntries(HORIZONS.map((h) => [h, ewmaVol]));

    await prisma.modelRegistryEntry.create({
      data: {
        modelName: "GJR-GARCH-1-1",
        version,
        metrics: JSON.stringify({
          params: gjrFit.params,
          logLikelihood: gjrFit.logLikelihood,
          converged: gjrFit.converged,
          observations: gjrFit.observations,
          forecastVolByHorizon: forecastByHorizon,
          championEwmaVolByHorizon: championByHorizon,
        }),
        isChampion: false,
        approvedBy: null,
      },
    });
    summary.gjrGarch = { ran: true, version };

    await prisma.auditLog.create({
      data: { actorService: `challenger:${triggeredBy}`, action: "MODEL_CHALLENGER_RUN", afterJson: JSON.stringify({ model: "GJR-GARCH-1-1", version }) },
    });
  }

  const quantiles = await computeConditionalQuantiles(SILVER_SYMBOL, HORIZONS);
  if (!quantiles) {
    summary.conditionalQuantiles = { ran: false, reason: `Cần đủ lịch sử giá cho horizon dài nhất (${Math.max(...HORIZONS)}d) + cửa sổ vol 20 ngày.` };
  } else {
    await prisma.modelRegistryEntry.create({
      data: {
        modelName: "REGIME-CONDITIONAL-QUANTILES",
        version,
        metrics: JSON.stringify({ quantilesByHorizon: quantiles }),
        isChampion: false,
        approvedBy: null,
      },
    });
    summary.conditionalQuantiles = { ran: true, version };

    await prisma.auditLog.create({
      data: { actorService: `challenger:${triggeredBy}`, action: "MODEL_CHALLENGER_RUN", afterJson: JSON.stringify({ model: "REGIME-CONDITIONAL-QUANTILES", version }) },
    });
  }

  return summary;
}
