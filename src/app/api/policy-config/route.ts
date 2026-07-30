import { NextRequest, NextResponse } from "next/server";
import { getActivePolicyConfig, listPolicyVersions, proposePolicyVersion } from "@/lib/policyStore";
import { requireRole } from "@/lib/apiAuth";
import { CAN_PROPOSE_POLICY } from "@/lib/roles";
import { PolicyConfig } from "@/lib/engine";

export async function GET() {
  const [active, versions] = await Promise.all([getActivePolicyConfig(), listPolicyVersions()]);
  return NextResponse.json({ active, versions });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(CAN_PROPOSE_POLICY);
  if ("error" in auth) return auth.error;

  const config = (await req.json()) as PolicyConfig;
  if (!config.policyVersion) {
    return NextResponse.json({ error: "policyVersion is required" }, { status: 400 });
  }
  const entry = await proposePolicyVersion(config, auth.session.user.email ?? undefined);
  return NextResponse.json({ id: entry.id, version: entry.version, isActive: entry.isActive });
}
