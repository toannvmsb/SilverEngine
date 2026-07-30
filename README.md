# SilverGuard Risk Engine

Công cụ tính toán **LTV** và **lãi suất** cho nghiệp vụ cầm bạc, xây dựng theo tài liệu kỹ thuật
*"SilverGuard Risk Engine v1.0"*. Chạy trên nền web (Next.js), một repo duy nhất, dev được trên
nhiều máy khác nhau qua Git.

## Phạm vi đã build (MVP) vs. tài liệu gốc

Tài liệu gốc mô tả một hệ thống nhiều tháng, nhiều team (ingestion tự động 8+ nguồn dữ liệu có
license, feature/model service riêng biệt, OIDC/mTLS, HA đa cơ sở...). Bản build này hiện thực
**đầy đủ phần lõi nghiệp vụ** — risk model, decision engine, LTV/lãi suất, portfolio monitoring,
audit/replay — chạy được ngay hôm nay, với các phần còn thiếu được **thiết kế sẵn chỗ cắm** để nối
tiếp dần:

| Phần | Trạng thái |
|---|---|
| Risk Score v1 (section 7.1), regime classification, hard triggers | ✅ Đầy đủ |
| Expected Shortfall theo horizon (historical simulation + parametric fallback) | ✅ Đầy đủ (fallback dùng khi chưa có chuỗi giá lịch sử) |
| Decision Engine — LTV cap, max loan, Approve/Refer/Decline/Stop (section 8) | ✅ Đầy đủ |
| Lãi suất theo rủi ro (base + term + regime + risk score premium) | ✅ Đầy đủ — **không có trong tài liệu gốc**, tự thiết kế theo yêu cầu, cần Pháp chế xác nhận trần lãi suất trước khi dùng thật |
| API contract (policies/current, decisions, portfolio, source-health) | ✅ Đầy đủ (section 10) |
| Database schema (14 bảng section 11) | ✅ Đầy đủ |
| Dashboard: Executive, Market, Policy, Calculator, Portfolio, Audit | ✅ Đầy đủ |
| RBAC 8 role + maker-checker cho policy | ✅ Đơn giản hoá (NextAuth credentials, chưa OIDC/mTLS) |
| Audit log + replay quyết định lịch sử | ✅ Đầy đủ |
| Portfolio stress test (-10/-20/-30%), alert | ✅ Đầy đủ (thủ công trigger, chưa có scheduler) |
| **Ingestion tự động** (Phú Quý feed/scraper, market vendor, FRED, CFTC COT, economic calendar) | ❌ Chưa làm — cần license/API key thật + phê duyệt Legal (đúng nguyên tắc "không hard-code credential" và "Yêu cầu pháp lý dữ liệu" trong tài liệu). Thay bằng **nhập tay có governance** ở trang Market Data — mỗi lần nhập được version hoá như một feature snapshot |
| Feature Engine tự động tính returns/vol/percentile từ time-series | ❌ Chưa làm — form Market Data nhận trực tiếp các feature đã tính (vol30d, drawdown...) do anh tự cập nhật từ nguồn trên mạng |
| GARCH/quantile regression/ML ensemble (Phase 2-3) | ❌ Chưa làm |
| Pawn Core CDC/integration thật | ❌ Chưa làm — có API `batch-upsert` sẵn để nối khi có Pawn Core |
| OIDC/mTLS, alert qua Telegram/Zalo/SMS | ❌ Chưa làm |

Nói cách khác: **phần "não" (risk model + decision engine + LTV + lãi suất) đã chạy đúng công thức
trong tài liệu**; phần "tay chân" (tự động thu thập dữ liệu 24/7 từ 8 nguồn có license) là việc của
giai đoạn Phase 0-1 kế tiếp, cần anh làm việc với Legal/Procurement trước (đúng nguyên tắc bất biến
trong tài liệu: không hard-code URL/credential, mọi nguồn phải được duyệt).

## Kiến trúc

```
src/lib/engine/        risk score, regime, expected shortfall, decision engine, interest engine
                        (pure functions, có thể unit test độc lập)
src/lib/pipeline.ts     "feature snapshot -> risk model -> decision/rule engine" (section 3)
src/lib/policyStore.ts  rule registry (maker-checker cho policy config)
src/app/api/v1/...      API contract theo section 10
src/app/*/page.tsx      dashboard (Executive, Market, Policy, Calculator, Portfolio, Audit)
prisma/schema.prisma    14 bảng theo section 11
```

Công thức implement đúng theo tài liệu (section 7-8):

```
risk_score = Σ component_score[i] * weight[i]        (price/vol 30%, macro 20%, positioning 15%,
                                                        liquidity 25%, event 10%)
final_regime = max(regime_from_score, regime_from_hard_triggers)

liquidation_value = buyback_price * eligible_weight * quality_factor * liquidity_factor
market_ltv_cap    = (1-downside_haircut)*(1-spread_buffer)*(1-liquidation_cost)*(1-safety_buffer)
final_ltv         = min(market_ltv_cap, term_cap, global_cap) - hard_trigger_reduction
max_loan          = floor_to_policy_unit(liquidation_value * final_ltv)

interest_apr = base + term_premium + regime_premium + risk_score_premium   (tự thiết kế, policy-configurable)
```

## Chạy local

```bash
npm install
cp .env.example .env          # SQLite mặc định, không cần cài Postgres
npm run db:push               # tạo bảng
npm run db:seed               # tài khoản mẫu + policy mặc định + source registry
npm run dev                   # http://localhost:3000
```

Tài khoản seed (đổi mật khẩu trước khi dùng thật):

| Email | Role | Mật khẩu |
|---|---|---|
| admin@silverguard.local | System Admin | ChangeMe123! |
| risk.approver@silverguard.local | Risk Approver | ChangeMe123! |
| risk.analyst@silverguard.local | Risk Analyst | ChangeMe123! |
| branch.operator@silverguard.local | Branch Operator | ChangeMe123! |
| auditor@silverguard.local | Auditor | ChangeMe123! |

**Luồng dùng thử:** đăng nhập `risk.analyst` → vào **Market Data**, nhập giá Phú Quý + các feature
(mặc định có sẵn giá trị mẫu hợp lý) → bấm lưu → xem **Executive**/**Policy** cập nhật Regime/LTV
ngay → đăng nhập `risk.approver` (hoặc branch operator) → vào **Calculator** để tính một giao dịch cụ
thể → xem **Audit** để replay lại quyết định.

Trước khi có dữ liệu thị trường, hệ thống **không** cho ra chính sách (503 "Chưa có dữ liệu") — đúng
nguyên tắc *fail closed* trong tài liệu, thay vì tự ý giả định một mức LTV không có cơ sở.

## Deploy production

- Đổi `datasource db { provider = "sqlite" }` trong `prisma/schema.prisma` sang `"postgresql"` và trỏ
  `DATABASE_URL` tới Postgres/TimescaleDB.
- Đặt `NEXTAUTH_SECRET` thật (`openssl rand -base64 32`) và `NEXTAUTH_URL` là domain thật.
- Đổi mật khẩu seed hoặc xoá user seed, tạo user thật.
- Xác nhận `interest.maxAprPct` trong Policy config với Pháp chế/Compliance trước khi dùng.
- `npm audit` hiện còn cảnh báo trên Next.js 14.2.x (đã dùng bản patch mới nhất của nhánh 14); cân
  nhắc nâng lên Next 15/16 sau khi có thời gian test kỹ (là breaking change, chưa làm trong lần này).

## Làm việc nhiều máy qua Git

Repo đã có `.gitignore` loại trừ `node_modules/`, `.next/`, `.env`, file DB local. Clone repo ở máy
khác, chạy lại 4 lệnh ở mục "Chạy local" là có môi trường dev giống hệt.
