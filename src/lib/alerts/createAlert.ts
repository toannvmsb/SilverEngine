import { prisma } from "@/lib/db";
import { isTelegramConfigured, sendTelegramMessage } from "./telegram";

const LEVEL_EMOJI: Record<string, string> = {
  INFO: "ℹ️",
  WARNING: "⚠️",
  HIGH: "🟠",
  CRITICAL: "🔴",
};

// Levels that page someone in real time (section 12: "CRITICAL... SMS/push/
// on-call"; HIGH also warrants prompt attention per the SLA table).
const DELIVER_LEVELS = new Set(["HIGH", "CRITICAL"]);

// Dedup window — section 12 "Alert phải deduplicate". A tight ingestion/
// scheduler loop re-evaluating the same breach every few minutes shouldn't
// re-page on every tick.
const DEDUP_WINDOW_MINUTES = 15;

export interface CreateAlertInput {
  level: "INFO" | "WARNING" | "HIGH" | "CRITICAL";
  category: string;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Creates an alert_event row and, for HIGH/CRITICAL, attempts Telegram
 * delivery. Deduplicates identical (level, category, message) alerts raised
 * again within DEDUP_WINDOW_MINUTES — the existing row's timestamp is left
 * alone (not "refreshed") so the dashboard still shows when it first fired.
 */
export async function createAlert(input: CreateAlertInput): Promise<void> {
  const since = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60_000);
  const dup = await prisma.alertEvent.findFirst({
    where: { level: input.level, category: input.category, message: input.message, createdAt: { gte: since } },
  });
  if (dup) return;

  const shouldDeliver = DELIVER_LEVELS.has(input.level) && isTelegramConfigured();
  let delivered = false;
  let deliveryError: string | null = null;

  if (shouldDeliver) {
    const text = `${LEVEL_EMOJI[input.level] ?? ""} <b>${input.level}</b> [${input.category}]\n${input.message}`;
    const result = await sendTelegramMessage(text);
    delivered = result.ok;
    deliveryError = result.ok ? null : result.error;
  }

  await prisma.alertEvent.create({
    data: {
      level: input.level,
      category: input.category,
      message: input.message,
      contextJson: input.context ? JSON.stringify(input.context) : null,
      delivered,
      deliveryChannel: shouldDeliver ? "telegram" : null,
      deliveryError,
    },
  });
}
