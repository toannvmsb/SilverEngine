import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/apiAuth";
import { CAN_ACKNOWLEDGE_ALERTS } from "@/lib/roles";

// Section 12 "Alert phải deduplicate và có acknowledgement/escalation".
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(CAN_ACKNOWLEDGE_ALERTS);
  if ("error" in auth) return auth.error;

  const alert = await prisma.alertEvent.findUnique({ where: { id: params.id } });
  if (!alert) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.alertEvent.update({
    where: { id: params.id },
    data: { acknowledged: true, acknowledgedBy: auth.session.user.email ?? auth.session.user.id, acknowledgedAt: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      actorId: auth.session.user.id,
      action: "ALERT_ACKNOWLEDGED",
      afterJson: JSON.stringify({ alertId: params.id, level: alert.level, category: alert.category }),
      correlationId: params.id,
    },
  });

  return NextResponse.json({ ok: true });
}
