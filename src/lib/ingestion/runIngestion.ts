import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { runPipeline, getLatestFeatureSnapshot, getLatestPhuQuyQuote } from "@/lib/pipeline";
import { MarketFeatureFormData, marketFeatureFormSchema } from "@/lib/featureSnapshot";
import { ConnectorError } from "@/lib/connectors/types";
import { fetchCftcCotSilver } from "@/lib/connectors/cftcCot";
import { fetchFredMacro } from "@/lib/connectors/fred";
import { fetchMetalsSpot } from "@/lib/connectors/metalsSpot";
import { fetchPhuQuyQuote, isPhuQuyConnectorConfigured } from "@/lib/connectors/phuQuy";
import { computeVolFeatures } from "./computeFeaturesFromHistory";

export interface IngestionSourceResult {
  sourceId: string;
  status: "OK" | "FAIL" | "SKIPPED_NOT_CONFIGURED";
  message?: string;
}

export interface IngestionRunResult {
  results: IngestionSourceResult[];
  regime?: string;
  riskScore?: number;
}

async function logResult(sourceId: string, status: IngestionSourceResult["status"], message?: string, raw?: unknown) {
  await prisma.rawIngestionLog.create({
    data: {
      sourceId,
      requestId: randomUUID(),
      status,
      rawUri: raw ? JSON.stringify(raw).slice(0, 4000) : null,
      errorMessage: message,
    },
  });
}

/**
 * Runs every configured automated connector, merges results on top of the
 * last saved feature snapshot (fields with no working connector yet — PMI,
 * event info, buyback status, liquidation days, price divergence — carry
 * forward unchanged, exactly like before this feature existed), and
 * publishes a new FeatureSnapshot + PolicySnapshot. A connector that isn't
 * configured or fails does NOT block the others; each is logged
 * independently to raw_ingestion_log for Source Health / debugging.
 */
export async function runIngestion(enteredBy: string): Promise<IngestionRunResult> {
  const baseline = await getLatestFeatureSnapshot();
  const baselineQuote = await getLatestPhuQuyQuote();
  if (!baseline || !baselineQuote) {
    throw new Error(
      "Chưa có dữ liệu thị trường nền (feature snapshot / Phú Quý quote). Vào Market Data nhập tay ít nhất 1 lần trước khi bật tự động."
    );
  }

  const merged: MarketFeatureFormData = { ...baseline.data };
  const results: IngestionSourceResult[] = [];
  let phuQuyUpdated = false;

  // 1. CFTC COT — public, no key required.
  try {
    const r = await fetchCftcCotSilver();
    merged.cotNetLongPercentile = r.cotNetLongPercentile;
    merged.oiShockPct = r.oiShockPct;
    await prisma.marketObservation.createMany({
      data: r.observations.map((o) => ({ symbol: o.symbol, value: o.value, unit: o.unit, sourceTime: o.sourceTime, quality: "PASS", sourceId: "CFTC_COT", enteredBy })),
    });
    results.push({ sourceId: "CFTC_COT", status: "OK" });
    await logResult("CFTC_COT", "OK", undefined, r.raw);
  } catch (e) {
    const msg = e instanceof ConnectorError ? e.message : String(e);
    results.push({ sourceId: "CFTC_COT", status: "FAIL", message: msg });
    await logResult("CFTC_COT", "FAIL", msg);
  }

  // 2. FRED — free but needs FRED_API_KEY.
  const fredKey = process.env.FRED_API_KEY;
  if (fredKey) {
    try {
      const r = await fetchFredMacro(fredKey);
      merged.realYield10y = r.realYield10y;
      merged.dxyChange20d = r.dxyChange20d;
      merged.dxyLevel = r.dxyLevel;
      await prisma.marketObservation.createMany({
        data: r.observations.map((o) => ({ symbol: o.symbol, value: o.value, unit: o.unit, sourceTime: o.sourceTime, quality: "PASS", sourceId: "FRED_YIELDS", enteredBy })),
      });
      results.push({ sourceId: "FRED_YIELDS", status: "OK" });
      await logResult("FRED_YIELDS", "OK");
    } catch (e) {
      const msg = e instanceof ConnectorError ? e.message : String(e);
      results.push({ sourceId: "FRED_YIELDS", status: "FAIL", message: msg });
      await logResult("FRED_YIELDS", "FAIL", msg);
    }
  } else {
    results.push({ sourceId: "FRED_YIELDS", status: "SKIPPED_NOT_CONFIGURED", message: "Thiếu FRED_API_KEY trong .env" });
  }

  // 3. Metals spot — needs GOLDAPI_KEY. Drives vol/drawdown once enough
  // days accumulate in our own MarketObservation history.
  const metalsKey = process.env.GOLDAPI_KEY;
  if (metalsKey) {
    try {
      const r = await fetchMetalsSpot(metalsKey);
      merged.silverSpotUsd = r.silverSpotUsd;
      merged.goldSpotUsd = r.goldSpotUsd;
      if (r.copperUsd) merged.copperUsd = r.copperUsd;
      await prisma.marketObservation.createMany({
        data: r.observations.map((o) => ({ symbol: o.symbol, value: o.value, unit: o.unit, sourceTime: o.sourceTime, quality: "PASS", sourceId: "SILVER_MARKET", enteredBy })),
      });

      const vol = await computeVolFeatures("SILVER_SPOT_USD");
      if (vol.vol30d !== undefined) merged.vol30d = vol.vol30d;
      if (vol.vol90d !== undefined) merged.vol90d = vol.vol90d;
      if (vol.ewmaVol !== undefined) merged.ewmaVol = vol.ewmaVol;
      if (vol.drawdown10d !== undefined) merged.drawdown10d = vol.drawdown10d;
      if (vol.drawdown20d !== undefined) merged.drawdown20d = vol.drawdown20d;
      if (vol.drawdown30d !== undefined) merged.drawdown30d = vol.drawdown30d;
      if (vol.drawdown60d !== undefined) merged.drawdown60d = vol.drawdown60d;

      results.push({
        sourceId: "SILVER_MARKET",
        status: "OK",
        message: vol.daysAvailable < 31 ? `Mới có ${vol.daysAvailable} ngày lịch sử giá — vol/drawdown vẫn dùng giá trị nhập tay cho tới khi đủ dữ liệu (cần >=31 ngày cho vol30d).` : undefined,
      });
      await logResult("SILVER_MARKET", "OK");
    } catch (e) {
      const msg = e instanceof ConnectorError ? e.message : String(e);
      results.push({ sourceId: "SILVER_MARKET", status: "FAIL", message: msg });
      await logResult("SILVER_MARKET", "FAIL", msg);
    }
  } else {
    results.push({ sourceId: "SILVER_MARKET", status: "SKIPPED_NOT_CONFIGURED", message: "Thiếu GOLDAPI_KEY trong .env" });
  }

  // 4. Phu Quy scraper — disabled until PHUQUY_QUOTE_URL/selectors are set.
  if (isPhuQuyConnectorConfigured()) {
    try {
      const r = await fetchPhuQuyQuote();
      merged.phuQuyBuyPrice = r.buyPrice;
      merged.phuQuySellPrice = r.sellPrice;
      merged.quoteSourceTime = new Date();
      phuQuyUpdated = true;
      results.push({ sourceId: "PHUQUY_BUYBACK", status: "OK" });
      await logResult("PHUQUY_BUYBACK", "OK", undefined, { buyPrice: r.buyPrice, sellPrice: r.sellPrice });
    } catch (e) {
      const msg = e instanceof ConnectorError ? e.message : String(e);
      results.push({ sourceId: "PHUQUY_BUYBACK", status: "FAIL", message: msg });
      await logResult("PHUQUY_BUYBACK", "FAIL", msg);
    }
  } else {
    results.push({
      sourceId: "PHUQUY_BUYBACK",
      status: "SKIPPED_NOT_CONFIGURED",
      message: "PHUQUY_QUOTE_API_ENABLED chưa bật (=true) trong .env — giá Phú Quý vẫn cần nhập tay ở Market Data.",
    });
  }

  const parsed = marketFeatureFormSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`Dữ liệu sau khi gộp không hợp lệ: ${JSON.stringify(parsed.error.issues)}`);
  }

  if (phuQuyUpdated) {
    await prisma.phuQuyQuote.create({
      data: {
        buyPrice: parsed.data.phuQuyBuyPrice,
        sellPrice: parsed.data.phuQuySellPrice,
        spreadPct: (parsed.data.phuQuySellPrice - parsed.data.phuQuyBuyPrice) / parsed.data.phuQuyBuyPrice,
        buybackStatus: parsed.data.buybackStatus,
        sourceTime: parsed.data.quoteSourceTime,
        enteredBy: `connector:PHUQUY_BUYBACK`,
      },
    });
  }

  await prisma.featureSnapshot.create({
    data: { asOf: new Date(), version: "FEAT-1.0-auto", features: JSON.stringify(parsed.data) },
  });

  const pipelineResult = await runPipeline(`ingestion:${enteredBy}`);

  return { results, regime: pipelineResult.regime, riskScore: pipelineResult.riskResult.score };
}
