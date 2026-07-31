import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth";
import { CAN_ENTER_MARKET_DATA } from "@/lib/roles";
import { runStressTest } from "@/lib/portfolio/runStressTest";

export const dynamic = "force-dynamic";

// Section 9 Portfolio Monitoring + section 10.3 POST /v1/stress-tests/run
export async function POST() {
  const auth = await requireRole(CAN_ENTER_MARKET_DATA);
  if ("error" in auth) return auth.error;

  const result = await runStressTest();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }

  return NextResponse.json({
    valuations_created: result.valuationsCreated,
    contracts_evaluated: result.contractsEvaluated,
    critical: result.critical,
    high: result.high,
    warning: result.warning,
  });
}
