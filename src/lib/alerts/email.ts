// Email delivery via Resend (https://resend.com) — free tier, no domain
// verification needed to start (their sandbox sender can deliver to the
// single email address you signed up with; verify a domain later to send
// to your whole team). Section 3 "alert-service: Email, Telegram, Zalo/SMS
// adapter" — Email chosen as the second channel after Telegram since it
// needs no business-account approval (unlike Zalo OA) or paid SMS provider.

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL_TO);
}

export async function sendAlertEmail(subject: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM || "SilverGuard Alerts <onboarding@resend.dev>";
  if (!apiKey || !to) return { ok: false, error: "RESEND_API_KEY/ALERT_EMAIL_TO chưa cấu hình" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend API HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
