import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLatestPhuQuyQuote } from "@/lib/pipeline";
import { requireRole } from "@/lib/apiAuth";
import { CAN_ENTER_MARKET_DATA } from "@/lib/roles";

// Section 9 Portfolio Monitoring + section 10.3 POST /v1/stress-tests/run
// Revalues every ACTIVE contract at current buyback price and at -10/-20/-30%
// shocks, derives current/stressed LTV, an alert level and a recommended
// action, per the section 9 alert table.
export async function POST() {
  const auth = await requireRole(CAN_ENTER_MARKET_DATA);
  if ("error" in auth) return auth.error;

  const quote = await getLatestPhuQuyQuote();
  if (!quote) {
    return NextResponse.json({ error: "NO_MARKET_DATA" }, { status: 503 });
  }

  const contracts = await prisma.portfolioContract.findMany({ where: { status: "ACTIVE" } });
  const now = new Date();
  const created: string[] = [];
  let critical = 0;
  let high = 0;
  let warning = 0;

  for (const c of contracts) {
    const eligibleWeight = c.weightGram * c.purity;
    const liquidationValue = quote.buyPrice * eligibleWeight;
    const currentLtv = c.principal / liquidationValue;
    const stressedLtv10 = c.principal / (liquidationValue * 0.9);
    const stressedLtv20 = c.principal / (liquidationValue * 0.8);
    const stressedLtv30 = c.principal / (liquidationValue * 0.7);
    const daysToMaturity = Math.ceil((c.maturesAt.getTime() - now.getTime()) / 86_400_000);

    let alertLevel: string | null = null;
    let action: string | null = null;
    if (quote.buybackStatus === "STOPPED" || currentLtv > 0.85 || stressedLtv20 > 0.85) {
      alertLevel = "CRITICAL";
      action = "PRIORITY_LIQUIDATION_REVIEW";
      critical++;
    } else if (stressedLtv20 > 0.85 || quote.spreadPct > 0.07) {
      alertLevel = "HIGH";
      action = "COLLECT_PARTIAL";
      high++;
    } else if (currentLtv > c.originalLtv || daysToMaturity <= 7) {
      alertLevel = "WARNING";
      action = daysToMaturity <= 7 ? "CALL_CUSTOMER" : "BLOCK_EXTENSION";
      warning++;
    } else if (daysToMaturity <= 7) {
      alertLevel = "INFO";
    }

    const valuation = await prisma.portfolioValuation.create({
      data: {
        contractId: c.contractId,
        liquidationValue,
        currentLtv,
        stressedLtv10,
        stressedLtv20,
        stressedLtv30,
        daysToMaturity,
        action,
        alertLevel,
      },
    });
    created.push(valuation.id);

    if (alertLevel && alertLevel !== "INFO") {
      await prisma.alertEvent.create({
        data: {
          level: alertLevel,
          category: "PORTFOLIO",
          message: `Hợp đồng ${c.contractId}: current LTV ${(currentLtv * 100).toFixed(1)}%, stressed(-20%) ${(stressedLtv20 * 100).toFixed(1)}% — ${action}`,
          contextJson: JSON.stringify({ contractId: c.contractId, currentLtv, stressedLtv20 }),
        },
      });
    }
  }

  return NextResponse.json({
    valuations_created: created.length,
    contracts_evaluated: contracts.length,
    critical,
    high,
    warning,
  });
}
