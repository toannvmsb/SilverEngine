import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/apiAuth";
import { CAN_PROMOTE_MODEL } from "@/lib/roles";

// Marks a model_registry entry as champion within its modelName group. This
// is a GOVERNANCE record only — computeDecision()/the live LTV formula still
// only consumes EWMA vol (src/lib/engine/decisionEngine.ts). Actually
// switching production to source volatility from a promoted challenger is a
// separate, deliberate code change, not an automatic side effect of this
// endpoint — matches "Model Developer: đăng challenger, không promote
// production" / "Risk Approver: phê duyệt model" in section 13.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(CAN_PROMOTE_MODEL);
  if ("error" in auth) return auth.error;

  const entry = await prisma.modelRegistryEntry.findUnique({ where: { id: params.id } });
  if (!entry) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.$transaction([
    prisma.modelRegistryEntry.updateMany({
      where: { modelName: entry.modelName, isChampion: true },
      data: { isChampion: false },
    }),
    prisma.modelRegistryEntry.update({
      where: { id: params.id },
      data: { isChampion: true, approvedBy: auth.session.user.email ?? auth.session.user.id, approvedAt: new Date() },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: auth.session.user.id,
      action: "MODEL_PROMOTED",
      afterJson: JSON.stringify({ modelRegistryId: params.id, modelName: entry.modelName, version: entry.version }),
      correlationId: params.id,
    },
  });

  return NextResponse.json({ ok: true });
}
