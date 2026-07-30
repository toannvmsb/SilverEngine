import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/apiAuth";
import { CAN_MANAGE_USERS, ROLES } from "@/lib/roles";
import { generateTempPassword } from "@/lib/generatePassword";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireRole(CAN_MANAGE_USERS);
  if ("error" in auth) return auth.error;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, branchId: true, disabled: true, createdAt: true },
  });
  return NextResponse.json({ users });
}

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(ROLES),
  branchId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireRole(CAN_MANAGE_USERS);
  if ("error" in auth) return auth.error;

  const parsed = createUserSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return NextResponse.json({ error: "EMAIL_ALREADY_EXISTS" }, { status: 409 });
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await prisma.user.create({
    data: { email: parsed.data.email, name: parsed.data.name, role: parsed.data.role, branchId: parsed.data.branchId, passwordHash },
  });

  await prisma.auditLog.create({
    data: {
      actorId: auth.session.user.id,
      action: "USER_CREATED",
      afterJson: JSON.stringify({ userId: user.id, email: user.email, role: user.role }),
      correlationId: user.id,
    },
  });

  // temp_password is returned exactly once — it is never stored in
  // plaintext anywhere (only its bcrypt hash is persisted).
  return NextResponse.json({ id: user.id, email: user.email, temp_password: tempPassword });
}
