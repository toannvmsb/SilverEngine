import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/apiAuth";
import { CAN_VIEW_GENERAL_DATA } from "@/lib/roles";
import { rateLimitOrResponse } from "@/lib/rateLimit";

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
});

// Self-service — any authenticated user can change their own password.
export async function POST(req: NextRequest) {
  const auth = await requireRole(CAN_VIEW_GENERAL_DATA);
  if ("error" in auth) return auth.error;

  // Rate-limited per user since this endpoint checks a password guess.
  const limited = rateLimitOrResponse(`change-password:${auth.session.user.id}`, 5, 10 * 60_000);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.session.user.id } });
  if (!user) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "WRONG_CURRENT_PASSWORD" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });

  await prisma.auditLog.create({
    data: { actorId: user.id, action: "PASSWORD_CHANGED_SELF", correlationId: user.id },
  });

  return NextResponse.json({ ok: true });
}
