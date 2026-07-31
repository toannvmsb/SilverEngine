import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth";
import { CAN_ENTER_MARKET_DATA } from "@/lib/roles";
import { runIngestion } from "@/lib/ingestion/runIngestion";

// Manually-triggered ingestion run (section 5 "Acquire -> Persist raw ->
// Parse -> Normalize -> Validate -> Publish -> Reconcile"), condensed into
// one call per connector. No scheduler wired yet per current deployment
// plan (local dev only) — call this from a cron once deployed (see README).
export async function POST() {
  const auth = await requireRole(CAN_ENTER_MARKET_DATA);
  if ("error" in auth) return auth.error;

  try {
    const result = await runIngestion(auth.session.user.email ?? auth.session.user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
