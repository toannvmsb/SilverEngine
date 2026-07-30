import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/apiAuth";
import { CAN_MANAGE_PORTFOLIO_CONTRACTS } from "@/lib/roles";

const bodySchema = z.object({
  status: z.enum(["REDEEMED", "LIQUIDATED", "DEFAULT"]),
});

// Closes out a contract (tất toán/thanh lý/vỡ nợ) — removes it from ACTIVE
// portfolio monitoring (section 9). Not in the original API contract
// (section 10.3 only defines batch-upsert), added since the demo needs a
// way to end a contract's lifecycle instead of accumulating ACTIVE forever.
export async function POST(req: NextRequest, { params }: { params: { contractId: string } }) {
  const auth = await requireRole(CAN_MANAGE_PORTFOLIO_CONTRACTS);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, { status: 400 });
  }

  const contract = await prisma.portfolioContract.findUnique({ where: { contractId: params.contractId } });
  if (!contract) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.portfolioContract.update({
    where: { contractId: params.contractId },
    data: { status: parsed.data.status },
  });

  await prisma.auditLog.create({
    data: {
      actorId: auth.session.user.id,
      action: "PORTFOLIO_CONTRACT_CLOSED",
      beforeJson: JSON.stringify({ status: contract.status }),
      afterJson: JSON.stringify({ contractId: params.contractId, status: parsed.data.status }),
      correlationId: params.contractId,
    },
  });

  return NextResponse.json({ ok: true });
}
