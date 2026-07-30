import { PolicyConfig, Regime } from "./types";

// 18.1 Reason codes tối thiểu
export const REASON_CODES = {
  DATA_STALE_CRITICAL: "Nguồn trọng yếu quá hạn",
  SOURCE_DIVERGENCE: "Nguồn chính và dự phòng lệch quá ngưỡng",
  BUYBACK_NOT_NORMAL: "Đối tác không mua lại bình thường",
  VOL_30D_HIGH: "Volatility 30 ngày cao",
  DRAWDOWN_10D_HIGH: "Giảm giá 10 ngày vượt ngưỡng",
  DRAWDOWN_30D_HIGH: "Giảm giá 30 ngày vượt ngưỡng",
  SPREAD_ABOVE_NORMAL: "Spread nội địa cao",
  EVENT_RISK_HIGH: "Có sự kiện rủi ro gần",
  TERM_NOT_ALLOWED: "Kỳ hạn bị khóa",
  PORTFOLIO_CONCENTRATION: "Danh mục vượt concentration cap",
  ASSET_QUALITY_HAIRCUT: "Tài sản bị giảm hệ số chất lượng",
  DEFENSIVE_MODE: "Hệ thống đang dùng chính sách phòng thủ",
  STOP_LENDING: "Dừng giải ngân",
  AMOUNT_EXCEEDS_CAP: "Số tiền yêu cầu vượt hạn mức tính toán",
  REQUIRES_RISK_APPROVAL: "Cần cấp Risk phê duyệt (maker-checker)",
} as const;

export type ReasonCode = keyof typeof REASON_CODES;

// Section 8 regime table (score buckets, suggested term/LTV ranges)
export const REGIME_TABLE: Record<
  Regime,
  { scoreMin: number; scoreMax: number; maxTermDays: number; ltvCapMin: number; ltvCapMax: number }
> = {
  LOW: { scoreMin: 0, scoreMax: 20, maxTermDays: 90, ltvCapMin: 0.6, ltvCapMax: 0.65 },
  NORMAL: { scoreMin: 21, scoreMax: 35, maxTermDays: 60, ltvCapMin: 0.55, ltvCapMax: 0.6 },
  CAUTIOUS: { scoreMin: 36, scoreMax: 50, maxTermDays: 30, ltvCapMin: 0.5, ltvCapMax: 0.55 },
  HIGH: { scoreMin: 51, scoreMax: 65, maxTermDays: 14, ltvCapMin: 0.4, ltvCapMax: 0.5 },
  STRESS: { scoreMin: 66, scoreMax: 80, maxTermDays: 7, ltvCapMin: 0.3, ltvCapMax: 0.4 },
  CRISIS: { scoreMin: 81, scoreMax: 100, maxTermDays: 0, ltvCapMin: 0, ltvCapMax: 0 },
};

// Default term status per regime (before hard-trigger overrides)
export const REGIME_TERM_STATUS: Record<Regime, "OPEN" | "LIMITED" | "REFER" | "STOP"> = {
  LOW: "OPEN",
  NORMAL: "OPEN",
  CAUTIOUS: "LIMITED",
  HIGH: "REFER",
  STRESS: "REFER",
  CRISIS: "STOP",
};

// 18.2 Cấu hình policy mẫu (defaults — editable via Policy admin page, versioned)
export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  policyVersion: "POL-1.0",
  globalLtvCap: 0.65,
  termCaps: { 7: 0.65, 14: 0.65, 30: 0.6, 60: 0.55, 90: 0.5 },
  standardTerms: [7, 14, 30, 60, 90],
  spreadBufferMultiplier: 1.0,
  liquidationCostPct: 0.02,
  safetyBufferPct: 0.03,
  policyFloorHaircut: { 7: 0.03, 14: 0.04, 30: 0.06, 60: 0.09, 90: 0.12 },
  policyRoundingUnit: 100_000,
  assetQuality: {
    damagedSealFactor: 0.85,
    unverifiedSerialFactor: 0.95,
  },
  liquidityFactor: {
    restrictedBuyback: 0.9,
    stoppedBuyback: 0,
  },
  interest: {
    baseAprPct: 18,
    termPremiumPctPerDay: 0.02,
    regimePremiumPct: {
      LOW: 0,
      NORMAL: 1,
      CAUTIOUS: 3,
      HIGH: 6,
      STRESS: 10,
      CRISIS: 0, // moot — CRISIS forces STOP, no new loans priced
    },
    maxScorePremiumPct: 5,
    minAprPct: 12,
    maxAprPct: 20, // placeholder ceiling — xác nhận với Pháp chế/Compliance trước khi dùng production
  },
};

export const RULE_SET_NAME = "silverguard-policy";
export const MODEL_VERSION = "RSK-1.0.0-mvp";
