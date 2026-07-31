import { ConnectorError, ConnectorObservation, assertInRange } from "./types";

// Precious metals spot price provider — GoldAPI.io (https://www.goldapi.io).
// Chosen over metals-api.com because it has a free signup tier (no credit
// card) and returns price directly in the requested currency per troy ounce
// (no "rate = units of metal per 1 base currency" inversion to get wrong).
// Still NOT live-verified from this session (see note in connectors/types.ts)
// — sanity check the printed price against a public quote once you have a
// real GOLDAPI_KEY. Copper (XCU) is not reliably available on GoldAPI's
// free tier, so it's best-effort and stays manual if the call fails.
const SOURCE_ID = "SILVER_MARKET";
const BASE_URL = "https://www.goldapi.io/api";

interface GoldApiResponse {
  metal?: string;
  currency?: string;
  price?: number;
  timestamp?: number; // unix seconds
  error?: string;
}

async function fetchOne(metal: "XAG" | "XAU" | "XCU", apiKey: string): Promise<GoldApiResponse> {
  const res = await fetch(`${BASE_URL}/${metal}/USD`, {
    headers: { "x-access-token": apiKey, "Content-Type": "application/json" },
  });
  const body = (await res.json()) as GoldApiResponse;
  if (!res.ok || body.error) {
    throw new ConnectorError(SOURCE_ID, `GoldAPI (${metal}) lỗi: ${body.error ?? `HTTP ${res.status}`}. Kiểm tra GOLDAPI_KEY.`);
  }
  if (typeof body.price !== "number") {
    throw new ConnectorError(SOURCE_ID, `GoldAPI (${metal}) response thiếu field 'price' — provider có thể đã đổi format.`);
  }
  return body;
}

export interface MetalsSpotResult {
  silverSpotUsd: number;
  goldSpotUsd: number;
  copperUsd: number | null;
  observations: ConnectorObservation[];
}

export async function fetchMetalsSpot(apiKey: string): Promise<MetalsSpotResult> {
  let silver: GoldApiResponse;
  let gold: GoldApiResponse;
  try {
    [silver, gold] = await Promise.all([fetchOne("XAG", apiKey), fetchOne("XAU", apiKey)]);
  } catch (e) {
    if (e instanceof ConnectorError) throw e;
    throw new ConnectorError(SOURCE_ID, "Không gọi được GoldAPI.io", e);
  }

  const silverSpotUsd = silver.price!;
  const goldSpotUsd = gold.price!;
  assertInRange(SOURCE_ID, "SILVER_SPOT", silverSpotUsd, 5, 200);
  assertInRange(SOURCE_ID, "GOLD_SPOT", goldSpotUsd, 500, 10000);

  const sourceTime = silver.timestamp ? new Date(silver.timestamp * 1000) : new Date();
  const observations: ConnectorObservation[] = [
    { symbol: "SILVER_SPOT_USD", value: silverSpotUsd, unit: "USD/oz", sourceTime },
    { symbol: "GOLD_SPOT_USD", value: goldSpotUsd, unit: "USD/oz", sourceTime },
  ];

  let copperUsd: number | null = null;
  try {
    const copper = await fetchOne("XCU", apiKey);
    copperUsd = copper.price!;
    observations.push({ symbol: "COPPER_USD", value: copperUsd, unit: "USD/oz (unverified — GoldAPI may quote per lb or ton for base metals)", sourceTime });
  } catch {
    // Copper is a minor "cross asset" feature, not critical — fine to skip silently.
  }

  return { silverSpotUsd, goldSpotUsd, copperUsd, observations };
}
