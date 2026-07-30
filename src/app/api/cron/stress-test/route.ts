import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cronAuth";
import { runStressTest } from "@/lib/portfolio/runStressTest";

export const dynamic = "force-dynamic";

// Vercel Cron target — see vercel.json.
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const result = await runStressTest();
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 503 });
  }
  return NextResponse.json(result);
}
