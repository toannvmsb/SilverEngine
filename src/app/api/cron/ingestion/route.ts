import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cronAuth";
import { runIngestion } from "@/lib/ingestion/runIngestion";

export const dynamic = "force-dynamic";

// Vercel Cron target — see vercel.json. Replaces `npm run scheduler`'s
// ingestion tick once deployed; the local scheduler script is still useful
// for pre-deploy dev/testing.
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  try {
    const result = await runIngestion("vercel-cron");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
