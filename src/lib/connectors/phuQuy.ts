import * as cheerio from "cheerio";
import { ConnectorError, ConnectorObservation, assertInRange } from "./types";

// Phu Quy domestic buy/sell price scraper — DISABLED until configured.
//
// This is the most important number in the whole system (it drives
// liquidation_value directly), and the doc's own section 4.2 "Chính sách
// scraper" requires: only scrape when no API/feed exists AND the
// partner/Legal has approved it, respect robots.txt/ToS/rate limits, and
// flag (not silently misparse) when the page structure changes.
//
// We don't have a real page URL to build against yet, so this is a generic
// CSS-selector-based scraper you configure via env vars once you have:
//   1. Confirmed scraping this page is allowed (robots.txt + ToS + ideally
//      partner sign-off — see section 4.2).
//   2. Inspected the real page HTML to find the buy/sell price selectors.
//
// Set in .env:
//   PHUQUY_QUOTE_URL=https://...
//   PHUQUY_BUY_SELECTOR=<CSS selector whose text is the buy price>
//   PHUQUY_SELL_SELECTOR=<CSS selector whose text is the sell price>
const SOURCE_ID = "PHUQUY_BUYBACK";

export interface PhuQuyScrapeResult {
  buyPrice: number;
  sellPrice: number;
  observations: ConnectorObservation[];
  rawHtmlSnippet: string;
}

export function isPhuQuyConnectorConfigured(): boolean {
  return Boolean(process.env.PHUQUY_QUOTE_URL && process.env.PHUQUY_BUY_SELECTOR && process.env.PHUQUY_SELL_SELECTOR);
}

function parsePriceText(text: string): number {
  // Strips currency symbols / thousands separators, e.g. "24.800 đ" -> 24800
  const cleaned = text.replace(/[^\d]/g, "");
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConnectorError(SOURCE_ID, `Không parse được số từ text "${text}"`);
  }
  return value;
}

export async function fetchPhuQuyQuote(): Promise<PhuQuyScrapeResult> {
  const url = process.env.PHUQUY_QUOTE_URL;
  const buySelector = process.env.PHUQUY_BUY_SELECTOR;
  const sellSelector = process.env.PHUQUY_SELL_SELECTOR;
  if (!url || !buySelector || !sellSelector) {
    throw new ConnectorError(
      SOURCE_ID,
      "Chưa cấu hình PHUQUY_QUOTE_URL / PHUQUY_BUY_SELECTOR / PHUQUY_SELL_SELECTOR trong .env — xem comment đầu file phuQuy.ts."
    );
  }

  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": "SilverGuardRiskEngine/0.1 (+internal risk pricing tool)" } });
  } catch (e) {
    throw new ConnectorError(SOURCE_ID, `Không tải được trang ${url}`, e);
  }
  if (!res.ok) {
    throw new ConnectorError(SOURCE_ID, `Trang giá Phú Quý trả về HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const buyText = $(buySelector).first().text().trim();
  const sellText = $(sellSelector).first().text().trim();
  if (!buyText || !sellText) {
    throw new ConnectorError(
      SOURCE_ID,
      `Selector không khớp phần tử nào trên trang (buy="${buySelector}" -> "${buyText}", sell="${sellSelector}" -> "${sellText}") — trang có thể đã đổi cấu trúc.`
    );
  }

  const buyPrice = parsePriceText(buyText);
  const sellPrice = parsePriceText(sellText);
  assertInRange(SOURCE_ID, "PHUQUY_BUY", buyPrice, 1000, 5_000_000);
  assertInRange(SOURCE_ID, "PHUQUY_SELL", sellPrice, 1000, 5_000_000);
  if (sellPrice <= buyPrice) {
    throw new ConnectorError(SOURCE_ID, `Giá bán (${sellPrice}) <= giá mua (${buyPrice}) — bất thường, từ chối nhận.`);
  }

  const sourceTime = new Date();
  return {
    buyPrice,
    sellPrice,
    rawHtmlSnippet: html.slice(0, 2000),
    observations: [
      { symbol: "PHUQUY_BUY", value: buyPrice, unit: "VND/gram", sourceTime },
      { symbol: "PHUQUY_SELL", value: sellPrice, unit: "VND/gram", sourceTime },
    ],
  };
}
