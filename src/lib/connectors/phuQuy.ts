import { ConnectorError, ConnectorObservation, assertInRange } from "./types";

// Phu Quy domestic silver price — JSON API found via browser DevTools
// (Network tab) on https://phuquy.com.vn/bang-gia/bac. The page itself is a
// client-rendered Angular SPA with no price data in the raw HTML, so DOM
// scraping doesn't work here — this calls the same backend endpoint the
// site's own frontend calls.
//
// This is NOT a documented/public API, so section 4.2's scraper policy
// still applies: only enable this after confirming with Phu Quy/Legal that
// polling it for internal risk pricing is acceptable, keep the polling
// interval reasonable, and don't republish the raw data. Gated behind
// PHUQUY_QUOTE_API_ENABLED=true so cloning this repo doesn't silently start
// hitting their backend by default.
//
// Response shape confirmed against a real captured response (2026-07):
//   { errorCode: "0", message: "Thành công", data: [
//     { id: "B", name: "Bạc PQ", buyprice: 212500, sellprice: 219100,
//       priceBuyTael: 2125000, priceSellTael: 2191000, unit_name: "Chỉ" }, ...
//   ] }
// buyprice/sellprice are VND per "Chỉ" (1 chỉ = 3.75g = 1/10 lượng), NOT per
// gram — dividing by 3.75 matches priceBuyTael/37.5 exactly in the sample.
// If Phu Quy changes this API, expect assertInRange or the "id === 'B'"
// lookup below to throw a clear error rather than silently misreading units.
const SOURCE_ID = "PHUQUY_BUYBACK";
const ENDPOINT = "https://be.phuquy.com.vn/jewelry/product-payment-service/api/products/get-price";
const GRAMS_PER_CHI = 3.75;

interface PhuQuyPriceItem {
  id: string; // "B" = silver ("Bạc PQ"); "V"/"S" = gold variants
  name: string;
  buyprice: number;
  sellprice: number;
  unit_name: string;
}

interface PhuQuyApiResponse {
  errorCode: string;
  message: string;
  data?: PhuQuyPriceItem[];
}

export function isPhuQuyConnectorConfigured(): boolean {
  return process.env.PHUQUY_QUOTE_API_ENABLED === "true";
}

export interface PhuQuyScrapeResult {
  buyPrice: number; // VND/gram
  sellPrice: number; // VND/gram
  observations: ConnectorObservation[];
}

export async function fetchPhuQuyQuote(): Promise<PhuQuyScrapeResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      headers: {
        accept: "application/json, text/plain, */*",
        origin: "https://phuquy.com.vn",
        referer: "https://phuquy.com.vn/",
        "user-agent": "Mozilla/5.0 (compatible; SilverGuardRiskEngine/0.1; internal risk pricing tool)",
      },
    });
  } catch (e) {
    throw new ConnectorError(SOURCE_ID, "Không gọi được API giá Phú Quý", e);
  }
  if (!res.ok) {
    throw new ConnectorError(SOURCE_ID, `API giá Phú Quý trả về HTTP ${res.status}`);
  }
  const body = (await res.json()) as PhuQuyApiResponse;
  if (body.errorCode !== "0" || !body.data) {
    throw new ConnectorError(SOURCE_ID, `API giá Phú Quý báo lỗi: ${body.message ?? body.errorCode}`);
  }

  const silver = body.data.find((d) => d.id === "B" || d.name.includes("Bạc"));
  if (!silver) {
    throw new ConnectorError(SOURCE_ID, "Không tìm thấy sản phẩm bạc (id='B') trong response — API có thể đã đổi cấu trúc.");
  }
  if (!Number.isFinite(silver.buyprice) || !Number.isFinite(silver.sellprice)) {
    throw new ConnectorError(SOURCE_ID, "Thiếu field buyprice/sellprice hợp lệ cho sản phẩm bạc.");
  }

  // VND has no fractional subunit, and the /gram conversion doesn't divide
  // evenly — round to the nearest VND rather than store "56746.666666664".
  const buyPrice = Math.round(silver.buyprice / GRAMS_PER_CHI);
  const sellPrice = Math.round(silver.sellprice / GRAMS_PER_CHI);
  assertInRange(SOURCE_ID, "PHUQUY_BUY", buyPrice, 1000, 5_000_000);
  assertInRange(SOURCE_ID, "PHUQUY_SELL", sellPrice, 1000, 5_000_000);
  if (sellPrice <= buyPrice) {
    throw new ConnectorError(SOURCE_ID, `Giá bán (${sellPrice}) <= giá mua (${buyPrice}) — bất thường, từ chối nhận.`);
  }

  const sourceTime = new Date();
  return {
    buyPrice,
    sellPrice,
    observations: [
      { symbol: "PHUQUY_BUY", value: buyPrice, unit: "VND/gram", sourceTime },
      { symbol: "PHUQUY_SELL", value: sellPrice, unit: "VND/gram", sourceTime },
    ],
  };
}
