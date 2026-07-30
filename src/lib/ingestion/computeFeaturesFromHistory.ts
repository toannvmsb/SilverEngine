import { prisma } from "@/lib/db";

// Computes realized vol / EWMA vol / drawdown from OUR OWN accumulated
// MarketObservation history, rather than depending on a paid historical-data
// endpoint from a vendor. This matches the doc's actual pipeline shape
// (raw store -> normalize -> feature store, section 3/6): connectors only
// need to fetch *today's* price; volatility/drawdown features improve
// automatically as more days of history accumulate in our DB. Until there's
// enough history, callers should fall back to the last manually-entered
// value (see runIngestion.ts).

interface DailyPoint {
  day: string;
  price: number;
}

export async function loadDailySeries(symbol: string, lookbackDays: number): Promise<DailyPoint[]> {
  const since = new Date(Date.now() - lookbackDays * 86_400_000);
  const rows = await prisma.marketObservation.findMany({
    where: { symbol, sourceTime: { gte: since } },
    orderBy: { sourceTime: "asc" },
  });
  const byDay = new Map<string, number>();
  for (const r of rows) {
    byDay.set(r.sourceTime.toISOString().slice(0, 10), r.value); // last obs of the day wins
  }
  return Array.from(byDay.entries()).map(([day, price]) => ({ day, price }));
}

export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) out.push(Math.log(prices[i] / prices[i - 1]));
  return out;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function ewmaVolOf(returns: number[], lambda = 0.94): number {
  let variance = returns[0] ** 2;
  for (let i = 1; i < returns.length; i++) variance = lambda * variance + (1 - lambda) * returns[i] ** 2;
  return Math.sqrt(variance);
}

function drawdownFromHigh(prices: number[]): number {
  const high = Math.max(...prices);
  return prices[prices.length - 1] / high - 1;
}

const ANNUALIZATION = Math.sqrt(365); // matches expectedShortfall.ts TRADING_DAYS_PER_YEAR basis

export interface VolFeatureResult {
  vol30d?: number;
  vol90d?: number;
  ewmaVol?: number;
  drawdown10d?: number;
  drawdown20d?: number;
  drawdown30d?: number;
  drawdown60d?: number;
  daysAvailable: number;
}

export async function computeVolFeatures(symbol: string): Promise<VolFeatureResult> {
  const series = await loadDailySeries(symbol, 400);
  const prices = series.map((s) => s.price);
  const result: VolFeatureResult = { daysAvailable: prices.length };

  if (prices.length >= 31) result.vol30d = stdev(logReturns(prices.slice(-31))) * ANNUALIZATION;
  if (prices.length >= 91) result.vol90d = stdev(logReturns(prices.slice(-91))) * ANNUALIZATION;
  if (prices.length >= 15) {
    const returns = logReturns(prices);
    result.ewmaVol = ewmaVolOf(returns.slice(-Math.min(90, returns.length))) * ANNUALIZATION;
  }
  if (prices.length >= 10) result.drawdown10d = drawdownFromHigh(prices.slice(-10));
  if (prices.length >= 20) result.drawdown20d = drawdownFromHigh(prices.slice(-20));
  if (prices.length >= 30) result.drawdown30d = drawdownFromHigh(prices.slice(-30));
  if (prices.length >= 60) result.drawdown60d = drawdownFromHigh(prices.slice(-60));

  return result;
}
