import { ConnectorError, ConnectorObservation, assertInRange } from "./types";

// FRED (Federal Reserve Bank of St. Louis) API — free, requires a personal
// API key (self-service, instant, no cost): https://fred.stlouisfed.org/docs/api/api_key.html
// Set FRED_API_KEY in .env. Section 4 table: "FRED API", daily.
const SOURCE_ID = "FRED_YIELDS";

interface FredObservation {
  date: string;
  value: string; // "." when missing (holiday/no release yet)
}

async function fetchSeries(seriesId: string, apiKey: string, limit = 40): Promise<FredObservation[]> {
  const url =
    `https://api.stlouisfed.org/fred/series/observations` +
    `?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new ConnectorError(SOURCE_ID, `Không gọi được FRED API cho series ${seriesId}`, e);
  }
  if (!res.ok) {
    throw new ConnectorError(SOURCE_ID, `FRED API (${seriesId}) trả về HTTP ${res.status} — kiểm tra FRED_API_KEY`);
  }
  const body = (await res.json()) as { observations?: FredObservation[] };
  if (!body.observations || body.observations.length === 0) {
    throw new ConnectorError(SOURCE_ID, `FRED API (${seriesId}) không trả observations — series id có thể sai.`);
  }
  return body.observations;
}

function latestValid(obs: FredObservation[]): { value: number; date: string } {
  for (const o of obs) {
    const v = Number(o.value);
    if (Number.isFinite(v)) return { value: v, date: o.date };
  }
  throw new ConnectorError(SOURCE_ID, "Không tìm thấy giá trị hợp lệ trong FRED observations (toàn bộ là '.')");
}

export interface FredMacroResult {
  realYield10y: number;
  dxyLevel: number;
  dxyChange20d: number;
  observations: ConnectorObservation[];
}

export async function fetchFredMacro(apiKey: string): Promise<FredMacroResult> {
  // DFII10 = 10-Year Treasury Inflation-Indexed Security, constant maturity
  // (the standard free proxy for "US 10Y real yield"), reported in percent.
  const yieldObs = await fetchSeries("DFII10", apiKey);
  const { value: yieldPct, date: yieldDate } = latestValid(yieldObs);
  const realYield10y = yieldPct / 100;
  assertInRange(SOURCE_ID, "DFII10", realYield10y, -0.05, 0.1);

  // DTWEXBGS = Trade Weighted U.S. Dollar Index: Broad, Goods and Services
  // (free FRED proxy for "DXY" — not the ICE DXY itself, which is not on FRED).
  const dxyObs = await fetchSeries("DTWEXBGS", apiKey);
  const validDxy = dxyObs.map((o) => ({ date: o.date, value: Number(o.value) })).filter((o) => Number.isFinite(o.value));
  if (validDxy.length < 15) {
    throw new ConnectorError(SOURCE_ID, "Không đủ dữ liệu DTWEXBGS (~20 phiên) để tính % thay đổi 20 ngày.");
  }
  const dxyLevel = validDxy[0].value;
  const dxy20dAgo = validDxy[Math.min(19, validDxy.length - 1)].value;
  const dxyChange20d = (dxyLevel - dxy20dAgo) / dxy20dAgo;
  assertInRange(SOURCE_ID, "DTWEXBGS_level", dxyLevel, 50, 200);

  return {
    realYield10y,
    dxyLevel,
    dxyChange20d,
    observations: [
      { symbol: "US10Y_REAL_YIELD", value: realYield10y, unit: "decimal", sourceTime: new Date(yieldDate) },
      { symbol: "DXY_BROAD", value: dxyLevel, unit: "index", sourceTime: new Date(validDxy[0].date) },
    ],
  };
}
