import { NextResponse } from "next/server";
import { requireRole } from "@/lib/apiAuth";
import { CAN_RUN_CHALLENGER_MODELS } from "@/lib/roles";
import { runChallengerModels } from "@/lib/models/runChallengerModels";

export async function POST() {
  const auth = await requireRole(CAN_RUN_CHALLENGER_MODELS);
  if ("error" in auth) return auth.error;

  const summary = await runChallengerModels(auth.session.user.email ?? auth.session.user.id);
  return NextResponse.json(summary);
}
