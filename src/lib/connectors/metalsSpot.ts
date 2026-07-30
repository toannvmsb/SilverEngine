import { ConnectorError, ConnectorObservation, assertInRange } from "./types";

// Precious metals spot price provider. Implemented against metals-api.com's
// documented contract (https://metals-api.com/documentation) since it's a
// commonly used free-tier option, but this was NOT live-verified (see note
// in connectors/types.ts) — free-tier plans on this kind of API sometimes
// restrict `base` to EUR only, and the "rates" they return are usually
// "units of metal per 1 base currency" (so price-per-oz = 1 / rate), which
// is easy to get backwards. Test locally with METALS_API_KEY and sanity
// check the printed price against any public silver/gold quote before
// trusting it; adjust BASE_URL/parsing here if your plan differs.
const SOURCE_ID = "SILVER_MARKET";
const BASE_URL = "https://metals-api.com/api/latest";

interface MetalsApiResponse {
  success: boolean;
  base: string;
  rates?: Record<string, number>;
  timestamp?: number;
  error?: { code: number; info: string };
}

export interface MetalsSpotResult {
  silverSpotUsd: number;
  goldSpotUsd: number;
  copperUsd: number | null;
  observations: ConnectorObservation[];
}

export async function fetchMetalsSpot(apiKey: string, base = "USD"): Promise<MetalsSpotResult> {
  const url = `${BASE_URL}?access_key=${apiKey}&base=${base}&symbols=XAU,XAG,XCU`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new ConnectorError(SOURCE_ID, "Không gọi được metals-api.com", e);
  }
  const body = (await res.json()) as MetalsApiResponse;
  if (!res.ok || !body.success || !body.rates) {
    throw new ConnectorError(
      SOURCE_ID,
      `metals-api.com lỗi: ${body.error?.info ?? `HTTP ${res.status}`}. Kiểm tra METALS_API_KEY và gói (free-tier có thể chỉ cho base=EUR).`
    );
  }

  const xag = body.rates["XAG"];
  const xau = body.rates["XAU"];
  if (!xag || !xau) {
    throw new ConnectorError(SOURCE_ID, "Response thiếu rates.XAG/XAU — provider có thể đã đổi format.");
  }

  // metals-api convention: rates.XAG = troy ounces of silver per 1 unit of `base`.
  // So price per oz (in `base` currency) = 1 / rate.
  const silverSpotUsd = 1 / xag;
  const goldSpotUsd = 1 / xau;
  const copperUsd = body.rates["XCU"] ? 1 / body.rates["XCU"] : null;

  assertInRange(SOURCE_ID, "SILVER_SPOT", silverSpotUsd, 5, 200);
  assertInRange(SOURCE_ID, "GOLD_SPOT", goldSpotUsd, 500, 10000);

  const sourceTime = body.timestamp ? new Date(body.timestamp * 1000) : new Date();

  const observations: ConnectorObservation[] = [
    { symbol: "SILVER_SPOT_USD", value: silverSpotUsd, unit: "USD/oz", sourceTime },
    { symbol: "GOLD_SPOT_USD", value: goldSpotUsd, unit: "USD/oz", sourceTime },
  ];
  if (copperUsd) observations.push({ symbol: "COPPER_UNVERIFIED_UNIT", value: copperUsd, unit: "unverified_provider_unit", sourceTime });

  return { silverSpotUsd, goldSpotUsd, copperUsd, observations };
}
