import { prisma } from "@/lib/db";
import { getLatestPhuQuyQuote } from "@/lib/pipeline";
import { createAlert } from "@/lib/alerts/createAlert";

export interface StressTestResult {
  valuationsCreated: number;
  contractsEvaluated: number;
  critical: number;
  high: number;
  warning: number;
}

/**
 * Section 9 Portfolio Monitoring + section 10.3 POST /v1/stress-tests/run.
 * Revalues every ACTIVE contract at the current buyback price and at
 * -10/-20/-30% shocks, derives current/stressed LTV, an alert level and a
 * recommended action per the section 9 alert table. Shared by the API route
 * (on-demand) and the scheduler (periodic, section 9 "ít nhất mỗi 5 phút").
 */
export async function runStressTest(): Promise<StressTestResult | { error: "NO_MARKET_DATA" }> {
  const quote = await getLatestPhuQuyQuote();
  if (!quote) return { error: "NO_MARKET_DATA" };

  const contracts = await prisma.portfolioContract.findMany({ where: { status: "ACTIVE" } });
  const now = new Date();
  let created = 0;
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

    await prisma.portfolioValuation.create({
      data: { contractId: c.contractId, liquidationValue, currentLtv, stressedLtv10, stressedLtv20, stressedLtv30, daysToMaturity, action, alertLevel },
    });
    created++;

    if (alertLevel && alertLevel !== "INFO") {
      await createAlert({
        level: alertLevel as "WARNING" | "HIGH" | "CRITICAL",
        category: "PORTFOLIO",
        message: `Hợp đồng ${c.contractId}: current LTV ${(currentLtv * 100).toFixed(1)}%, stressed(-20%) ${(stressedLtv20 * 100).toFixed(1)}% — ${action}`,
        context: { contractId: c.contractId, currentLtv, stressedLtv20 },
      });
    }
  }

  return { valuationsCreated: created, contractsEvaluated: contracts.length, critical, high, warning };
}
