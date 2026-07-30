import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/apiAuth";
import { CAN_MANAGE_USERS, ROLES } from "@/lib/roles";

const patchSchema = z.object({
  role: z.enum(ROLES).optional(),
  branchId: z.string().optional(),
  disabled: z.boolean().optional(),
});

// Users are disabled, never deleted — audit_log.actorId references User, so
// deleting one would orphan/break the historical audit trail (section 13
// "Decision log và raw market snapshot không được sửa").
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(CAN_MANAGE_USERS);
  if ("error" in auth) return auth.error;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, { status: 400 });
  }

  if (params.id === auth.session.user.id && parsed.data.disabled === true) {
    return NextResponse.json({ error: "CANNOT_DISABLE_SELF" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const updated = await prisma.user.update({ where: { id: params.id }, data: parsed.data });

  await prisma.auditLog.create({
    data: {
      actorId: auth.session.user.id,
      action: "USER_UPDATED",
      beforeJson: JSON.stringify({ role: target.role, branchId: target.branchId, disabled: target.disabled }),
      afterJson: JSON.stringify({ role: updated.role, branchId: updated.branchId, disabled: updated.disabled }),
      correlationId: params.id,
    },
  });

  return NextResponse.json({ ok: true });
}
