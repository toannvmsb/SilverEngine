import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Section 10.3 GET /v1/portfolio/actions?severity=HIGH
export async function GET(req: NextRequest) {
  const severity = new URL(req.url).searchParams.get("severity");

  const contracts = await prisma.portfolioContract.findMany({ where: { status: "ACTIVE" } });
  const latest = await Promise.all(
    contracts.map(async (c) => ({
      contract: c,
      valuation: await prisma.portfolioValuation.findFirst({ where: { contractId: c.contractId }, orderBy: { asOf: "desc" } }),
    }))
  );

  const actions = latest
    .filter((x) => x.valuation?.action)
    .filter((x) => !severity || x.valuation?.alertLevel === severity)
    .map((x) => ({
      contract_id: x.contract.contractId,
      branch_id: x.contract.branchId,
      alert_level: x.valuation!.alertLevel,
      action: x.valuation!.action,
      current_ltv: x.valuation!.currentLtv,
      stressed_ltv_20pct: x.valuation!.stressedLtv20,
      days_to_maturity: x.valuation!.daysToMaturity,
    }));

  return NextResponse.json({ actions });
}
