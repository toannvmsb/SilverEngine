import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { RoleName } from "@/lib/roles";

export async function requireRole(allowed: RoleName[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) } as const;
  }
  if (session.user.disabled) {
    return { error: NextResponse.json({ error: "ACCOUNT_DISABLED" }, { status: 401 }) } as const;
  }
  if (!allowed.includes(session.user.role as RoleName)) {
    return { error: NextResponse.json({ error: "FORBIDDEN", requiredRoles: allowed }, { status: 403 }) } as const;
  }
  return { session } as const;
}
