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
| Dashboard: Executive, Market, Policy, Calculator, Portfolio, Data Quality, Governance, Audit | ✅ Đầy đủ (7/7 màn hình section 12) |
| RBAC 8 role + maker-checker cho policy | ✅ Đơn giản hoá (NextAuth credentials, chưa OIDC/mTLS) |
| Audit log + replay quyết định lịch sử | ✅ Đầy đủ |
| Portfolio stress test (-10/-20/-30%), alert | ✅ Đầy đủ — bấm thủ công hoặc tự động qua scheduler |
| Scheduler tự động chạy ingestion + revalue portfolio | ✅ `npm run scheduler` — chạy local, chưa cần deploy (xem mục Scheduler) |
| Cảnh báo Telegram cho HIGH/CRITICAL alert | ✅ Optional — cần `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (xem mục Cảnh báo) |
| GJR-GARCH(1,1) + regime-conditional quantiles (Phase 2) | ✅ Chạy như **challenger** ở trang Governance — chưa tự động ảnh hưởng LTV, cần đủ lịch sử giá + con người promote (xem mục Model Governance) |
| **Ingestion tự động — CFTC COT** | ⚠️ Code xong nhưng **CFTC chặn theo IP/quốc gia từ Việt Nam** (đã xác nhận cả qua code lẫn mở thẳng trên trình duyệt — không phải lỗi của mình, không sửa được bằng code). Mặc định tắt (`CFTC_COT_ENABLED=false`), COT vẫn nhập tay — chỉ 15% trọng số Risk Score nên không cấp thiết. Thử bật lại nếu sau này deploy server đặt tại Mỹ |
| **Ingestion tự động — FRED** (real yield, dollar index) | ✅ Đầy đủ, đã chạy thật thành công — cần `FRED_API_KEY` miễn phí |
| **Ingestion tự động — giá bạc/vàng quốc tế** | ✅ Đầy đủ, đã chạy thật thành công với GoldAPI.io — cần `GOLDAPI_KEY` free-tier |
| **Ingestion tự động — giá Phú Quý** | ✅ Gọi thẳng API JSON nội bộ mà trang phuquy.com.vn tự dùng (`be.phuquy.com.vn/.../get-price`, không cần key). **Mặc định tắt** (`PHUQUY_QUOTE_API_ENABLED=false`) — anh tự bật `=true` sau khi xác nhận với Phú Quý/Legal là polling API này cho mục đích nội bộ chấp nhận được (section 4.2). Trang gốc là Angular SPA nên không scrape được HTML tĩnh — phải gọi thẳng API này |
| Feature Engine (vol/drawdown từ time-series) | ✅ Tự tính từ lịch sử giá **do chính hệ thống tích luỹ** (không cần API lịch sử trả phí) — cần vài chục ngày dữ liệu tích luỹ mới đủ cho vol30d/90d, trước đó vẫn dùng giá trị nhập tay |
| **Unit test tự động** cho toàn bộ công thức (`npm test`) | ✅ 62 test, `src/lib/engine/*` — phát hiện và sửa 1 bug thật khi viết test (xem "Tình trạng thật" bên dưới) |
| Xác nhận (acknowledge) cảnh báo | ✅ Nút bấm trên Executive, ghi `acknowledgedBy`/`acknowledgedAt` |
| Đóng hợp đồng (tất toán/thanh lý/vỡ nợ) | ✅ Trang Portfolio — chuyển khỏi danh sách ACTIVE |
| Giới hạn tần suất gọi API (rate limiting) | ✅ Đăng nhập (5 lần sai/5 phút/email) + `/v1/decisions` (60 request/phút/user) — in-memory, đủ cho 1 instance, chưa dùng được nếu deploy nhiều instance/serverless (xem comment `src/lib/rateLimit.ts`) |
| **Rà soát bảo mật** (section 15 "Security") | ✅ Đã chạy 1 vòng, tìm và sửa 1 lỗi nghiêm trọng thật (6 API GET lộ dữ liệu không cần đăng nhập) — xem "Lỗi bảo mật đã tìm và sửa" bên dưới |
| **Quản lý người dùng qua giao diện** | ✅ Trang `/users` (chỉ System Admin) — tạo tài khoản (mật khẩu tạm hiện 1 lần), đổi role, khoá/mở khoá (có hiệu lực ngay cả với phiên đang đăng nhập, không cần đợi hết hạn) |
| ML ensemble (Phase 3) | ❌ Chưa làm |
| Pawn Core CDC/integration thật | ❌ Chưa làm — có API `batch-upsert` sẵn để nối khi có Pawn Core |
| OIDC/mTLS, alert qua Zalo/SMS | ❌ Chưa làm (Telegram đã có) |
| Load/security test chính thức, backtest với dữ liệu thật | ❌ Chưa làm — chưa có đủ lịch sử giao dịch thật để backtest có ý nghĩa |

Nói cách khác: **phần "não" (risk model + decision engine + LTV + lãi suất) đã chạy đúng công thức
trong tài liệu**; phần "tay chân" (tự động thu thập dữ liệu 24/7 từ 8 nguồn có license) là việc của
giai đoạn Phase 0-1 kế tiếp, cần anh làm việc với Legal/Procurement trước (đúng nguyên tắc bất biến
trong tài liệu: không hard-code URL/credential, mọi nguồn phải được duyệt).

## Kiến trúc

```
src/lib/engine/         risk score, regime, expected shortfall, decision engine, interest engine
                         (pure functions, có thể unit test độc lập)
src/lib/pipeline.ts      "feature snapshot -> risk model -> decision/rule engine" (section 3)
src/lib/policyStore.ts   rule registry (maker-checker cho policy config)
src/lib/connectors/      CFTC/FRED/GoldAPI/Phú Quý connectors
src/lib/ingestion/       ingestion orchestration + feature-from-history computation
src/lib/alerts/          createAlert() + Telegram delivery
src/lib/models/          GJR-GARCH, regime-conditional quantiles (challenger models)
src/app/api/v1/...       API contract theo section 10
src/app/*/page.tsx       dashboard: Executive, Market, Policy, Calculator, Portfolio,
                         Data Quality, Governance, Audit (7/7 màn hình section 12)
prisma/schema.prisma     14 bảng theo section 11
scripts/scheduler.ts     local cron thay thế (npm run scheduler)
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

### Bug thật đã tìm và sửa nhờ viết unit test

Khi viết test cho `regimeFromScore`, phát hiện: bảng regime dùng mốc số nguyên rời rạc (LOW 0-20,
NORMAL 21-35, ...) nhưng risk_score thực tế là số thập phân (làm tròn 1 chữ số). Một điểm như 20.3
hay 35.7 rơi vào "khe hở" giữa 2 mốc, không khớp điều kiện nào, và hàm cũ âm thầm trả về mặc định
`CRISIS` — tức là nhảy thẳng lên mức rủi ro cao nhất/STOP_NEW_LOANS một cách sai, cho một điểm số
tầm trung bình thường. Đã sửa (`src/lib/engine/regime.ts`) và có test chặn regressions
(`regime.test.ts`). Đây đúng là loại lỗi mà bộ test tự động sinh ra để bắt.

### Lỗi bảo mật đã tìm và sửa

Chạy 1 vòng rà soát bảo mật (skill chuyên dụng, xác minh chéo bằng sub-agent độc lập để lọc báo nhầm)
trên toàn bộ code đã build, tìm ra 1 lỗi nghiêm trọng thật: **6 API GET quên gắn kiểm tra đăng
nhập** (`/v1/portfolio/summary`, `/v1/portfolio/actions`, `/v1/policies/current`, `/v1/source-health`,
`/market-snapshot`, `/policy-config`) — `src/middleware.ts` loại trừ toàn bộ `/api/*` khỏi middleware
NextAuth, nên bảo mật hoàn toàn phụ thuộc từng route tự gọi `requireRole()`; mọi route POST đều gọi
đúng, nhưng 6 route GET này thì quên. Kết quả: bất kỳ ai cũng gọi được và xem dư nợ, LTV danh mục,
chính sách lãi suất đang áp dụng mà không cần tài khoản, một khi đã deploy public. Đã sửa toàn bộ,
xác nhận bằng test thực tế (401 khi chưa đăng nhập, 200 khi đã đăng nhập). Cũng sửa luôn 1 lỗi mức
trung bình cùng đợt: API cập nhật chính sách LTV không kiểm tra giới hạn hợp lý (có thể gửi
`globalLtvCap: 5` = 500%).

## Chạy local

```bash
npm install
cp .env.example .env          # SQLite mặc định, không cần cài Postgres
npm run db:push               # tạo bảng
npm run db:seed               # tài khoản mẫu + policy mặc định + source registry
npm run dev                   # http://localhost:3000
```

Chạy bộ test (khuyến nghị chạy trước mỗi lần deploy hoặc sau khi sửa `src/lib/engine`):
```bash
npm test
```

Tài khoản seed (đổi mật khẩu trước khi dùng thật):

| Email | Role | Mật khẩu |
|---|---|---|
| admin@silverguard.local | System Admin | ChangeMe123! |
| risk.approver@silverguard.local | Risk Approver | ChangeMe123! |
| risk.analyst@silverguard.local | Risk Analyst | ChangeMe123! |
| branch.operator@silverguard.local | Branch Operator | ChangeMe123! |
| auditor@silverguard.local | Auditor | ChangeMe123! |

**Thêm nhân viên thật**: đăng nhập System Admin → trang **Users** (chỉ Admin thấy trên menu) → tạo
tài khoản, hệ thống sinh mật khẩu tạm hiện 1 lần duy nhất (gửi cho nhân viên qua kênh riêng, không
qua email/chat công khai) — không cần chạy script nữa. Có thể đổi role, khoá/mở khoá (có hiệu lực
ngay cả với phiên đang đăng nhập) và cấp lại mật khẩu tạm bất kỳ lúc nào.

**Luồng dùng thử:** đăng nhập `risk.analyst` → vào **Market Data**, nhập giá Phú Quý + các feature
(mặc định có sẵn giá trị mẫu hợp lý) → bấm lưu → xem **Executive**/**Policy** cập nhật Regime/LTV
ngay → đăng nhập `risk.approver` (hoặc branch operator) → vào **Calculator** để tính một giao dịch cụ
thể → xem **Audit** để replay lại quyết định.

Trước khi có dữ liệu thị trường, hệ thống **không** cho ra chính sách (503 "Chưa có dữ liệu") — đúng
nguyên tắc *fail closed* trong tài liệu, thay vì tự ý giả định một mức LTV không có cơ sở.

## Tự động lấy dữ liệu (connector)

Trang **Market Data** có nút **"Làm mới từ API"**: gọi các connector đã bật trong `.env`
(`FRED_API_KEY`, `GOLDAPI_KEY`, `PHUQUY_QUOTE_API_ENABLED`, `CFTC_COT_ENABLED`), ghi đè các trường
tương ứng, còn trường nào chưa có connector (PMI, event risk, liquidation days, price divergence,
buyback status) thì **giữ nguyên giá trị nhập tay gần nhất** — không có gì bị ép phải tự động hoá
cùng lúc.

Yêu cầu trước khi bấm nút này lần đầu: đã nhập tay **ít nhất 1 lần** ở Market Data (hệ thống cần một
baseline để biết các trường chưa-tự-động-hoá lấy giá trị gì) — đúng tinh thần *fail closed*, không tự
suy đoán số liệu khi chưa có gì làm nền.

Trạng thái đã xác nhận bằng chạy thật (không phải chỉ code xong):
- ✅ **FRED, GoldAPI, Phú Quý**: đã chạy thành công trên máy thật, trả về `OK`.
- ⚠️ **CFTC**: bị chặn theo IP/quốc gia từ Việt Nam (403, xác nhận cả qua trình duyệt) — không phải
  lỗi code, mặc định tắt. Xem comment đầu `src/lib/connectors/cftcCot.ts`.

Chi tiết từng connector, field mapping: xem comment đầu mỗi file trong `src/lib/connectors/`.

## Scheduler — tự động chạy định kỳ (chạy local, không cần deploy)

Mở **thêm 1 terminal** (song song với `npm run dev`), chạy:
```bash
npm run scheduler
```
Script này gọi thẳng vào database (không qua HTTP/session), nên không bị next dev restart làm gián
đoạn. Mặc định: ingestion mỗi 15 phút, revalue portfolio (stress test) mỗi 5 phút — chỉnh qua
`INGESTION_INTERVAL_MINUTES` / `STRESS_TEST_INTERVAL_MINUTES` trong `.env`. Dừng bằng `Ctrl+C`.

Yêu cầu tương tự nút "Làm mới từ API": cần đã nhập tay Market Data ít nhất 1 lần trước khi scheduler
chạy có ý nghĩa (ingestion sẽ log lỗi rõ ràng và tự thử lại ở lần chạy kế tiếp nếu chưa có baseline).

Khi deploy thật (Vercel/VPS), thay `npm run scheduler` bằng cron job trong hạ tầng gọi
`POST /api/ingestion/run` và `POST /api/v1/stress-tests/run` (cả hai đã yêu cầu role phù hợp — cần
đổi sang xác thực bằng secret header thay vì session cookie nếu Vercel Cron gọi trực tiếp, hỏi em khi
anh tới bước này).

## Cảnh báo Telegram

Khi có alert mức **HIGH** hoặc **CRITICAL** (buyback stopped, portfolio breach, regime STRESS/CRISIS,
dữ liệu quá hạn...), hệ thống tự gửi tin nhắn Telegram nếu đã cấu hình:

1. Chat với **@BotFather** trên Telegram → `/newbot` → đặt tên → nhận **bot token**.
2. Gửi bất kỳ tin nhắn nào cho bot vừa tạo (để bot "biết" chat này).
3. Mở trình duyệt: `https://api.telegram.org/bot<TOKEN>/getUpdates` → tìm `"chat":{"id": ...}` → đó là
   **chat id** của anh.
4. Trong `.env`:
   ```
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHAT_ID=...
   ```
5. Chạy lại `npm run dev` (và `npm run scheduler` nếu đang chạy).

Alert được dedupe trong 15 phút (không spam lặp cùng 1 cảnh báo mỗi lần ingestion chạy). Xem toàn bộ
lịch sử + trạng thái gửi (`delivered`/`deliveryError`) trong bảng `AlertEvent` hoặc trên Executive
dashboard.

## Model Governance — GJR-GARCH & regime-conditional quantiles

Trang **Governance** cho phép chạy 2 model "Phase 2" trong tài liệu gốc (section 7) như
**challenger** — tự fit trên chuỗi giá `SILVER_SPOT_USD` mà hệ thống tự tích luỹ (không cần API
lịch sử trả phí):

- **GJR-GARCH(1,1)**: dự báo volatility có tính bất đối xứng (cú sốc giảm giá làm tăng vol nhiều hơn
  cú sốc tăng giá cùng độ lớn) — so sánh trực tiếp với EWMA (champion hiện tại) theo từng kỳ hạn.
- **Regime-Conditional Quantiles**: thay cho "quantile regression" đúng nghĩa (cần nhiều dữ liệu hơn
  hệ thống hiện có để đáng tin) — dùng quantile thực nghiệm của lợi suất h-ngày, chia theo regime
  volatility (LOW/MED/HIGH tercile) tại thời điểm đó, tự động rơi về "unconditional" nếu bucket hiện
  tại chưa đủ mẫu.

**Quan trọng**: đây là model thử nghiệm — bấm "Promote" chỉ đánh dấu trong model_registry để Risk
theo dõi/so sánh, **không** tự động thay đổi công thức LTV đang chạy (decision engine vẫn dùng EWMA
theo đúng tài liệu gốc). Muốn đưa 1 model đã promote vào production thật thì cần sửa code nối vào
`src/lib/engine/decisionEngine.ts` — một quyết định kỹ thuật có chủ đích, không phải side effect của
nút bấm này.

Cần tối thiểu ~40 ngày lịch sử giá cho GJR-GARCH (ít hơn cho quantile fallback dạng unconditional) —
bật `GOLDAPI_KEY` + chạy `npm run scheduler` vài tuần để tích luỹ đủ trước khi kỳ vọng có kết quả.

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
