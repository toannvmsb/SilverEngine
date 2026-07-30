import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/apiAuth";
import { CAN_VIEW_GENERAL_DATA } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Section 10.3 GET /v1/source-health
export async function GET() {
  const auth = await requireRole(CAN_VIEW_GENERAL_DATA);
  if ("error" in auth) return auth.error;

  const sources = await prisma.sourceRegistry.findMany({ orderBy: { priority: "asc" } });
  const quote = await prisma.phuQuyQuote.findFirst({ orderBy: { sourceTime: "desc" } });
  const feature = await prisma.featureSnapshot.findFirst({ orderBy: { asOf: "desc" } });

  const health = sources.map((s) => {
    let ageSeconds: number | null = null;
    if (s.sourceId === "PHUQUY_BUYBACK" && quote) ageSeconds = (Date.now() - quote.sourceTime.getTime()) / 1000;
    if (s.dataDomain !== "phuquy" && feature) ageSeconds = (Date.now() - feature.asOf.getTime()) / 1000;
    const stale = ageSeconds !== null && ageSeconds > s.staleAfterSeconds;
    return {
      source_id: s.sourceId,
      source_name: s.sourceName,
      method: s.method,
      enabled: s.enabled,
      license_status: s.licenseStatus,
      age_seconds: ageSeconds !== null ? Math.round(ageSeconds) : null,
      stale_after_seconds: s.staleAfterSeconds,
      status: !s.enabled ? "DISABLED" : ageSeconds === null ? "NO_DATA" : stale ? "STALE" : "OK",
    };
  });

  return NextResponse.json({ sources: health });
}
