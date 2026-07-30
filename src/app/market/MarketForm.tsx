"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Badges";

type FormState = Record<string, string | boolean>;

// <input type="datetime-local"> has no timezone concept — it displays
// whatever string it's given as if it were local wall-clock time. Using
// toISOString() directly gives the UTC representation, which reads as
// wrong-by-the-local-offset (e.g. 7h off in Vietnam, UTC+7). Shift the
// instant by the local offset first so the string that comes out matches
// what the clock on the wall actually says.
function toLocalDatetimeValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

const DEFAULTS: FormState = {
  phuQuyBuyPrice: "56700",
  phuQuySellPrice: "58400",
  buybackStatus: "NORMAL",
  quoteSourceTime: toLocalDatetimeValue(new Date()),
  silverSpotUsd: "31.5",
  goldSpotUsd: "2650",
  copperUsd: "4.6",
  dxyLevel: "104",
  usdVnd: "25400",
  vol30d: "0.22",
  vol90d: "0.2",
  ewmaVol: "0.24",
  drawdown20d: "-0.05",
  drawdown60d: "-0.08",
  dxyChange20d: "0.01",
  realYield10y: "0.018",
  pmi: "49.5",
  cotNetLongPercentile: "55",
  oiShockPct: "0.05",
  priceDivergencePct: "0.005",
  liquidationDays: "2",
  hoursToNextEvent: "48",
  eventSeverity: "MEDIUM",
  drawdown10d: "-0.03",
  drawdown30d: "-0.07",
  criticalSourceUnavailable: false,
  modelServiceHealthy: true,
};

const FIELD_GROUPS: { title: string; fields: { name: string; label: string; type?: string }[] }[] = [
  {
    title: "Giá Phú Quý (bắt buộc)",
    fields: [
      { name: "phuQuyBuyPrice", label: "Giá mua vào (VND/gram bạc, vd ~56.700)" },
      { name: "phuQuySellPrice", label: "Giá bán ra (VND/gram bạc)" },
      { name: "buybackStatus", label: "Trạng thái mua lại (NORMAL/RESTRICTED/STOPPED)" },
      { name: "quoteSourceTime", label: "Thời điểm báo giá", type: "datetime-local" },
    ],
  },
  {
    title: "Tham chiếu thị trường quốc tế (tùy chọn, hiển thị dashboard)",
    fields: [
      { name: "silverSpotUsd", label: "Silver spot (USD/oz)" },
      { name: "goldSpotUsd", label: "Gold spot (USD/oz)" },
      { name: "copperUsd", label: "Copper (USD/lb)" },
      { name: "dxyLevel", label: "DXY level" },
      { name: "usdVnd", label: "USD/VND" },
    ],
  },
  {
    title: "Price & Volatility",
    fields: [
      { name: "vol30d", label: "Realized vol 30d (decimal, vd 0.22)" },
      { name: "vol90d", label: "Realized vol 90d" },
      { name: "ewmaVol", label: "EWMA vol (dùng cho ES/haircut)" },
      { name: "drawdown20d", label: "Drawdown from 20d high (âm, vd -0.05)" },
      { name: "drawdown60d", label: "Drawdown from 60d high" },
    ],
  },
  {
    title: "Macro",
    fields: [
      { name: "dxyChange20d", label: "DXY % change 20d" },
      { name: "realYield10y", label: "US 10Y real yield" },
      { name: "pmi", label: "PMI" },
    ],
  },
  {
    title: "Positioning",
    fields: [
      { name: "cotNetLongPercentile", label: "COT net-long percentile (0-100)" },
      { name: "oiShockPct", label: "Open interest shock (decimal)" },
    ],
  },
  {
    title: "Physical / local liquidity",
    fields: [
      { name: "priceDivergencePct", label: "Divergence Phú Quý vs quốc tế" },
      { name: "liquidationDays", label: "Số ngày ước tính thanh lý" },
    ],
  },
  {
    title: "Event risk",
    fields: [
      { name: "hoursToNextEvent", label: "Giờ tới sự kiện tiếp theo" },
      { name: "eventSeverity", label: "Mức độ (LOW/MEDIUM/HIGH)" },
    ],
  },
  {
    title: "Hard trigger inputs",
    fields: [
      { name: "drawdown10d", label: "Drawdown 10d (âm)" },
      { name: "drawdown30d", label: "Drawdown 30d (âm)" },
    ],
  },
];

export default function MarketForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResults, setIngestResults] = useState<
    { sourceId: string; status: string; message?: string }[] | null
  >(null);

  useEffect(() => {
    fetch("/api/market-snapshot")
      .then((r) => r.json())
      .then((d) => {
        if (d.feature?.data) {
          const f = d.feature.data;
          setForm((prev) => ({
            ...prev,
            ...f,
            quoteSourceTime: toLocalDatetimeValue(new Date(f.quoteSourceTime ?? d.quote?.sourceTime ?? Date.now())),
          }));
        }
      })
      .catch(() => {});
  }, []);

  function update(name: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function reloadPrefill() {
    const r = await fetch("/api/market-snapshot").then((res) => res.json());
    if (r.feature?.data) {
      const f = r.feature.data;
      setForm((prev) => ({
        ...prev,
        ...f,
        quoteSourceTime: toLocalDatetimeValue(new Date(f.quoteSourceTime ?? r.quote?.sourceTime ?? Date.now())),
      }));
    }
  }

  async function handleIngest() {
    setIngesting(true);
    setError(null);
    setMessage(null);
    setIngestResults(null);
    const res = await fetch("/api/ingestion/run", { method: "POST" });
    const body = await res.json();
    setIngesting(false);
    if (!res.ok) {
      setError(body.error ?? "Có lỗi khi chạy ingestion.");
      return;
    }
    setIngestResults(body.results);
    setMessage(`Đã chạy ingestion. Regime: ${body.regime}, Risk Score: ${body.riskScore}`);
    await reloadPrefill();
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/market-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "FORBIDDEN" ? "Bạn không có quyền nhập dữ liệu thị trường." : JSON.stringify(body));
      return;
    }
    const body = await res.json();
    setMessage(`Đã lưu. Regime mới: ${body.regime}, Risk Score: ${body.riskScore}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card title="Tự động lấy dữ liệu (connector)">
        <p className="mb-3 text-sm text-slate-500">
          Gọi các nguồn đã cấu hình (CFTC COT, FRED, metals spot, Phú Quý nếu đã bật) rồi tự động
          điền/ghi đè các trường tương ứng bên dưới — trường nào chưa có connector vẫn giữ nguyên
          giá trị nhập tay gần nhất.
        </p>
        <button
          type="button"
          onClick={handleIngest}
          disabled={ingesting}
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
        >
          {ingesting ? "Đang lấy dữ liệu..." : "Làm mới từ API"}
        </button>
        {ingestResults && (
          <ul className="mt-3 space-y-1 text-sm">
            {ingestResults.map((r) => (
              <li key={r.sourceId} className="flex items-start gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    r.status === "OK"
                      ? "bg-green-100 text-green-800"
                      : r.status === "FAIL"
                        ? "bg-red-100 text-red-800"
                        : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {r.status}
                </span>
                <span className="text-slate-700">
                  <strong>{r.sourceId}</strong>
                  {r.message ? ` — ${r.message}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

      {FIELD_GROUPS.map((group) => (
        <Card key={group.title} title={group.title}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.fields.map((f) => (
              <div key={f.name}>
                <label className="mb-1 block text-xs font-medium text-slate-600">{f.label}</label>
                <input
                  type={f.type ?? "text"}
                  value={String(form[f.name] ?? "")}
                  onChange={(e) => update(f.name, e.target.value)}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card title="Governance overrides (khẩn cấp)">
        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.criticalSourceUnavailable)}
              onChange={(e) => update("criticalSourceUnavailable", e.target.checked)}
            />
            Nguồn trọng yếu đang mất (critical source unavailable)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.modelServiceHealthy)}
              onChange={(e) => update("modelServiceHealthy", e.target.checked)}
            />
            Model service hoạt động bình thường
          </label>
        </div>
      </Card>

      <button
        type="submit"
        disabled={loading}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? "Đang lưu..." : "Lưu & tính lại chính sách"}
      </button>
      </form>
    </div>
  );
}
