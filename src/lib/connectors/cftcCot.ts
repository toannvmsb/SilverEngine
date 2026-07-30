import { ConnectorError, ConnectorObservation } from "./types";

// CFTC Commitments of Traders — public Socrata Open Data API, no API key
// required (US government open data). Section 4 table: "CFTC Public
// Reporting API", weekly.
//
// Dataset: "Disaggregated Futures and Options Combined Reports" (silver is a
// physical commodity, reported under the disaggregated — not legacy —
// report, which breaks out Managed Money separately from Producer/Merchant).
// Socrata dataset id kh3c-gbw2 is the disaggregated combined report as of
// this writing; CFTC has renamed/retired dataset ids before, so if this
// 404s, look up the current id at https://publicreporting.cftc.gov and
// update SOCRATA_DATASET below.
const SOCRATA_DATASET = "kh3c-gbw2";
const SOURCE_ID = "CFTC_COT";

interface CftcRow {
  report_date_as_yyyy_mm_dd: string;
  open_interest_all: string;
  m_money_positions_long_all: string;
  m_money_positions_short_all: string;
  commodity_name: string;
}

export interface CftcCotResult {
  observations: ConnectorObservation[];
  cotNetLongPercentile: number;
  oiShockPct: number;
  raw: CftcRow[];
}

export async function fetchCftcCotSilver(): Promise<CftcCotResult> {
  const url =
    `https://publicreporting.cftc.gov/resource/${SOCRATA_DATASET}.json` +
    `?$where=upper(commodity_name)='SILVER'` +
    `&$order=report_date_as_yyyy_mm_dd DESC` +
    `&$limit=156`; // ~3 years of weekly reports, enough for a percentile

  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (e) {
    throw new ConnectorError(SOURCE_ID, "Không gọi được CFTC Public Reporting API", e);
  }
  if (!res.ok) {
    throw new ConnectorError(SOURCE_ID, `CFTC API trả về HTTP ${res.status}`);
  }
  const rows = (await res.json()) as CftcRow[];
  if (!Array.isArray(rows) || rows.length < 10) {
    throw new ConnectorError(
      SOURCE_ID,
      `CFTC API trả về ${Array.isArray(rows) ? rows.length : "không phải mảng"} dòng — không đủ để tính percentile (cần >=10). Kiểm tra lại dataset id / field name, có thể CFTC đã đổi cấu trúc.`
    );
  }

  const netLongSeries = rows.map((r) => {
    const long = Number(r.m_money_positions_long_all);
    const short = Number(r.m_money_positions_short_all);
    if (!Number.isFinite(long) || !Number.isFinite(short)) {
      throw new ConnectorError(SOURCE_ID, "Thiếu field m_money_positions_long_all/short_all trong response — CFTC có thể đã đổi tên field.");
    }
    return long - short;
  });

  const latest = netLongSeries[0];
  const sorted = [...netLongSeries].sort((a, b) => a - b);
  const rank = sorted.filter((v) => v <= latest).length;
  const cotNetLongPercentile = Math.round((rank / sorted.length) * 100);

  const latestOi = Number(rows[0].open_interest_all);
  const prevOi = Number(rows[1].open_interest_all);
  const oiShockPct = prevOi > 0 ? Math.abs((latestOi - prevOi) / prevOi) : 0;

  const sourceTime = new Date(rows[0].report_date_as_yyyy_mm_dd);

  return {
    cotNetLongPercentile,
    oiShockPct,
    raw: rows.slice(0, 5),
    observations: [
      { symbol: "COT_NET_LONG_SILVER", value: latest, unit: "contracts", sourceTime },
      { symbol: "COT_OPEN_INTEREST_SILVER", value: latestOi, unit: "contracts", sourceTime },
    ],
  };
}
