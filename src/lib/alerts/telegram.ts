// Telegram Bot API delivery — section 3 "alert-service: Email, Telegram,
// Zalo/SMS adapter". Telegram chosen first since it's free and quick to set
// up (BotFather), unlike Zalo OA (business verification) or SMS (paid).
//
// Setup (see README "Cảnh báo Telegram"):
//   1. Message @BotFather on Telegram, /newbot, get the bot token.
//   2. Message your new bot once (any text) so it can reply to you.
//   3. GET https://api.telegram.org/bot<TOKEN>/getUpdates to find your chat id.
//   4. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegramMessage(text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, error: "TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID chưa cấu hình" };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Telegram API HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
