import { NextRequest, NextResponse } from "next/server";
import { activatePolicyVersion } from "@/lib/policyStore";
import { requireRole } from "@/lib/apiAuth";
import { CAN_APPROVE_POLICY } from "@/lib/roles";
import { prisma } from "@/lib/db";

// Maker-checker step: a Risk Approver activates a version an Analyst proposed.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(CAN_APPROVE_POLICY);
  if ("error" in auth) return auth.error;

  await activatePolicyVersion(params.id, auth.session.user.email ?? auth.session.user.id);

  await prisma.auditLog.create({
    data: {
      actorId: auth.session.user.id,
      action: "POLICY_ACTIVATED",
      afterJson: JSON.stringify({ ruleRegistryId: params.id }),
      correlationId: params.id,
    },
  });

  return NextResponse.json({ ok: true });
}
