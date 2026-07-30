import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { marketFeatureFormSchema } from "@/lib/featureSnapshot";
import { runPipeline, getLatestFeatureSnapshot, getLatestPhuQuyQuote } from "@/lib/pipeline";
import { requireRole } from "@/lib/apiAuth";
import { CAN_ENTER_MARKET_DATA, CAN_VIEW_GENERAL_DATA } from "@/lib/roles";

export async function GET() {
  const auth = await requireRole(CAN_VIEW_GENERAL_DATA);
  if ("error" in auth) return auth.error;

  const [feature, quote] = await Promise.all([getLatestFeatureSnapshot(), getLatestPhuQuyQuote()]);
  return NextResponse.json({ feature, quote });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(CAN_ENTER_MARKET_DATA);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = marketFeatureFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;
  const enteredBy = auth.session.user.email ?? auth.session.user.id;

  await prisma.phuQuyQuote.create({
    data: {
      buyPrice: d.phuQuyBuyPrice,
      sellPrice: d.phuQuySellPrice,
      spreadPct: (d.phuQuySellPrice - d.phuQuyBuyPrice) / d.phuQuyBuyPrice,
      buybackStatus: d.buybackStatus,
      sourceTime: d.quoteSourceTime,
      enteredBy,
    },
  });

  const rawObservations: { symbol: string; value: number; unit: string }[] = [];
  if (d.silverSpotUsd !== undefined) rawObservations.push({ symbol: "SILVER_SPOT", value: d.silverSpotUsd, unit: "USD/oz" });
  if (d.goldSpotUsd !== undefined) rawObservations.push({ symbol: "GOLD_SPOT", value: d.goldSpotUsd, unit: "USD/oz" });
  if (d.copperUsd !== undefined) rawObservations.push({ symbol: "COPPER", value: d.copperUsd, unit: "USD/lb" });
  if (d.dxyLevel !== undefined) rawObservations.push({ symbol: "DXY", value: d.dxyLevel, unit: "index" });
  if (d.usdVnd !== undefined) rawObservations.push({ symbol: "USDVND", value: d.usdVnd, unit: "VND" });

  if (rawObservations.length > 0) {
    await prisma.marketObservation.createMany({
      data: rawObservations.map((o) => ({
        symbol: o.symbol,
        value: o.value,
        unit: o.unit,
        sourceTime: d.quoteSourceTime,
        quality: "PASS",
        sourceId: "MANUAL",
        enteredBy,
      })),
    });
  }

  await prisma.featureSnapshot.create({
    data: {
      asOf: d.quoteSourceTime,
      version: "FEAT-1.0-manual",
      features: JSON.stringify(d),
    },
  });

  const result = await runPipeline(enteredBy);

  return NextResponse.json({
    ok: true,
    regime: result.regime,
    riskScore: result.riskResult.score,
    policySnapshotId: result.policySnapshot.id,
  });
}
