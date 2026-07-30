import { z } from "zod";
import { BuybackStatus, HardTriggerContext, RiskScoreInputs } from "@/lib/engine";

// Manual-entry substitute for the automated feature engine (section 6).
// A Data Engineer / Risk Analyst enters values that would otherwise be
// computed by the ingestion + feature-service pipeline. Every submission is
// timestamped and versioned in `feature_snapshot`, preserving the
// point-in-time / explainability requirements (sections 2 and 6) even though
// the numbers are typed in rather than pulled from a live feed.

export const marketFeatureFormSchema = z.object({
  // Phu Quy quote (drives liquidation_value + freshness hard trigger)
  phuQuyBuyPrice: z.coerce.number().positive(),
  phuQuySellPrice: z.coerce.number().positive(),
  buybackStatus: z.enum(["NORMAL", "RESTRICTED", "STOPPED"]),
  quoteSourceTime: z.coerce.date(),

  // Optional raw references, shown on the Market dashboard only
  silverSpotUsd: z.coerce.number().optional(),
  goldSpotUsd: z.coerce.number().optional(),
  copperUsd: z.coerce.number().optional(),
  dxyLevel: z.coerce.number().optional(),
  usdVnd: z.coerce.number().optional(),

  // Price/volatility (section 6 "Volatility", "Drawdown")
  vol30d: z.coerce.number().min(0).max(3),
  vol90d: z.coerce.number().min(0).max(3),
  ewmaVol: z.coerce.number().min(0).max(3),
  drawdown20d: z.coerce.number().min(-1).max(0),
  drawdown60d: z.coerce.number().min(-1).max(0),

  // Macro
  dxyChange20d: z.coerce.number().min(-1).max(1),
  realYield10y: z.coerce.number().min(-0.1).max(0.2),
  pmi: z.coerce.number().min(0).max(100),

  // Positioning
  cotNetLongPercentile: z.coerce.number().min(0).max(100),
  oiShockPct: z.coerce.number().min(0).max(2),

  // Physical/local liquidity extras (spread/status come from the quote above)
  priceDivergencePct: z.coerce.number().min(-1).max(1),
  liquidationDays: z.coerce.number().min(0).max(60),

  // Event risk
  hoursToNextEvent: z.coerce.number().min(0).max(24 * 30),
  eventSeverity: z.enum(["LOW", "MEDIUM", "HIGH"]),

  // Hard-trigger-only fields (section 8 hard trigger table)
  drawdown10d: z.coerce.number().min(-1).max(0),
  drawdown30d: z.coerce.number().min(-1).max(0),
  criticalSourceUnavailable: z.coerce.boolean().default(false),
  modelServiceHealthy: z.coerce.boolean().default(true),
});

export type MarketFeatureFormData = z.infer<typeof marketFeatureFormSchema>;

export function toRiskScoreInputs(d: MarketFeatureFormData): RiskScoreInputs {
  const spreadPct = (d.phuQuySellPrice - d.phuQuyBuyPrice) / d.phuQuyBuyPrice;
  return {
    priceVol: {
      vol30d: d.vol30d,
      vol90d: d.vol90d,
      ewmaVol: d.ewmaVol,
      drawdown20d: d.drawdown20d,
      drawdown60d: d.drawdown60d,
    },
    macro: { dxyChange20d: d.dxyChange20d, realYield10y: d.realYield10y, pmi: d.pmi },
    positioning: { cotNetLongPercentile: d.cotNetLongPercentile, oiShockPct: d.oiShockPct },
    liquidity: {
      spreadPct,
      buybackStatus: d.buybackStatus as BuybackStatus,
      priceDivergencePct: d.priceDivergencePct,
      liquidationDays: d.liquidationDays,
    },
    event: { hoursToNextEvent: d.hoursToNextEvent, eventSeverity: d.eventSeverity },
  };
}

export function toHardTriggerContext(
  d: MarketFeatureFormData,
  phuquyQuoteAgeMinutes: number,
  portfolioStressLtv20: number | null
): HardTriggerContext {
  const spreadPct = (d.phuQuySellPrice - d.phuQuyBuyPrice) / d.phuQuyBuyPrice;
  return {
    buybackStatus: d.buybackStatus as BuybackStatus,
    phuquyQuoteAgeMinutes,
    drawdown10d: d.drawdown10d,
    drawdown30d: d.drawdown30d,
    spreadPct,
    criticalSourceUnavailable: d.criticalSourceUnavailable,
    modelServiceHealthy: d.modelServiceHealthy,
    portfolioStressLtv20,
  };
}
