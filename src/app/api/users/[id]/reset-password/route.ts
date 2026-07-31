import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/apiAuth";
import { CAN_MANAGE_USERS } from "@/lib/roles";
import { generateTempPassword } from "@/lib/generatePassword";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(CAN_MANAGE_USERS);
  if ("error" in auth) return auth.error;

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  await prisma.user.update({ where: { id: params.id }, data: { passwordHash, mustChangePassword: true } });

  await prisma.auditLog.create({
    data: {
      actorId: auth.session.user.id,
      action: "USER_PASSWORD_RESET",
      afterJson: JSON.stringify({ userId: params.id }),
      correlationId: params.id,
    },
  });

  return NextResponse.json({ temp_password: tempPassword });
}
