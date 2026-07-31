import { NextRequest, NextResponse } from "next/server";

// Vercel Cron Jobs can't carry a user session cookie, so scheduled routes
// under /api/cron/* use a shared secret instead of requireRole(). Vercel
// automatically sends `Authorization: Bearer $CRON_SECRET` on every cron
// invocation once the CRON_SECRET env var is set on the project — see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
//
// Fails closed: if CRON_SECRET isn't configured, every call is rejected
// rather than silently allowing unauthenticated access.
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  return null;
}
