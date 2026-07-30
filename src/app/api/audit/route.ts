import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/apiAuth";
import { CAN_VIEW_AUDIT } from "@/lib/roles";

export async function GET() {
  const auth = await requireRole(CAN_VIEW_AUDIT);
  if ("error" in auth) return auth.error;

  const decisions = await prisma.decisionLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const auditLogs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ decisions, auditLogs });
}
