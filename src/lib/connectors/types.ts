// Common interface for automated data connectors (section 4 Source Registry).
//
// IMPORTANT: these connectors were written and type-checked in a sandboxed
// coding session with no outbound internet access (only npm/GitHub are
// reachable there), so their exact request/response parsing could NOT be
// live-verified against the real APIs. They implement the documented API
// contracts as of this writing, with defensive validation so a shape change
// or bad value surfaces as a clear error (caught by runIngestion.ts and
// shown in Source Health / ingestion result) rather than silently feeding a
// wrong number into an LTV calculation. Test locally after adding API keys
// and report back if a provider's response no longer matches.

export interface ConnectorObservation {
  symbol: string;
  value: number;
  unit: string;
  sourceTime: Date;
}

export interface ConnectorResult {
  sourceId: string;
  observations: ConnectorObservation[];
  raw: unknown;
}

export class ConnectorError extends Error {
  constructor(
    public sourceId: string,
    message: string,
    public cause?: unknown
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

/** Defensive range check — section 5 DQ rule "Biến động giá 1 tick >10% -> Quarantine". */
export function assertInRange(sourceId: string, symbol: string, value: number, min: number, max: number) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new ConnectorError(
      sourceId,
      `${symbol}=${value} nằm ngoài khoảng hợp lý [${min}, ${max}] — nghi ngờ lỗi parse hoặc API đổi cấu trúc, từ chối nhận giá trị này.`
    );
  }
}
