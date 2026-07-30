import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Section 10.3 GET /v1/portfolio/summary
export async function GET() {
  const contracts = await prisma.portfolioContract.findMany({ where: { status: "ACTIVE" } });
  const totalPrincipal = contracts.reduce((s, c) => s + c.principal, 0);

  const byTerm: Record<number, number> = {};
  for (const c of contracts) byTerm[c.termDays] = (byTerm[c.termDays] ?? 0) + c.principal;

  const latestValuations = await Promise.all(
    contracts.map((c) => prisma.portfolioValuation.findFirst({ where: { contractId: c.contractId }, orderBy: { asOf: "desc" } }))
  );
  const valued = latestValuations.filter((v): v is NonNullable<typeof v> => v !== null);
  const avgCurrentLtv = valued.length ? valued.reduce((s, v) => s + v.currentLtv, 0) / valued.length : null;
  const maxStressedLtv20 = valued.length ? Math.max(...valued.map((v) => v.stressedLtv20)) : null;
  const alertCounts = valued.reduce<Record<string, number>>((acc, v) => {
    if (v.alertLevel) acc[v.alertLevel] = (acc[v.alertLevel] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    active_contracts: contracts.length,
    total_principal: totalPrincipal,
    exposure_by_term_days: byTerm,
    avg_current_ltv: avgCurrentLtv,
    max_stressed_ltv_20pct: maxStressedLtv20,
    alert_counts: alertCounts,
    valuations_available: valued.length,
  });
}
