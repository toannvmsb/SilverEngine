"use client";

import { useState } from "react";
import { Card, DecisionBadge } from "@/components/Badges";
import { DecisionState } from "@/lib/engine";

interface DecisionResponse {
  decision_id: string;
  decision: DecisionState;
  approved_ltv: number;
  max_loan: number;
  max_term_days: number;
  interest_rate_apr_pct: number;
  liquidation_value: number;
  reason_codes: string[];
  policy_version: string;
  model_version: string;
  expires_at: string;
}

export default function CalculatorForm() {
  const [branchId, setBranchId] = useState("HN01");
  const [assetId, setAssetId] = useState("");
  const [weightGram, setWeightGram] = useState("500");
  const [purity, setPurity] = useState("0.999");
  const [sealStatus, setSealStatus] = useState<"INTACT" | "DAMAGED">("INTACT");
  const [serialVerified, setSerialVerified] = useState(true);
  const [termDays, setTermDays] = useState("30");
  const [amount, setAmount] = useState("15000000");
  const [result, setResult] = useState<DecisionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const res = await fetch("/api/v1/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branch_id: branchId,
        asset_id: assetId || `ASSET-${Date.now()}`,
        weight_gram: Number(weightGram),
        purity: Number(purity),
        seal_status: sealStatus,
        serial_verified: serialVerified,
        requested_term_days: Number(termDays),
        requested_amount: Number(amount),
        request_id: crypto.randomUUID(),
      }),
    });
    setLoading(false);
    const body = await res.json();
    if (!res.ok) {
      setError(body.message ?? body.error ?? "Có lỗi xảy ra.");
      return;
    }
    setResult(body);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title="Thông tin giao dịch">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Chi nhánh</label>
            <input value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Mã tài sản (asset_id)</label>
            <input value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder="để trống sẽ tự sinh" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Khối lượng (gram)</label>
              <input value={weightGram} onChange={(e) => setWeightGram(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Độ tinh khiết (0-1)</label>
              <input value={purity} onChange={(e) => setPurity(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Tình trạng seal</label>
              <select value={sealStatus} onChange={(e) => setSealStatus(e.target.value as "INTACT" | "DAMAGED")} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                <option value="INTACT">INTACT</option>
                <option value="DAMAGED">DAMAGED</option>
              </select>
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={serialVerified} onChange={(e) => setSerialVerified(e.target.checked)} />
                Serial đã xác minh
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Kỳ hạn yêu cầu (ngày)</label>
              <select value={termDays} onChange={(e) => setTermDays(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                {[7, 14, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Số tiền yêu cầu (VND)</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full rounded bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
            {loading ? "Đang tính..." : "Tính LTV & Quyết định"}
          </button>
        </form>
      </Card>

      <Card title="Kết quả">
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!error && !result && <p className="text-sm text-slate-400">Nhập thông tin và bấm tính để xem kết quả.</p>}
        {result && (
          <div className="space-y-3">
            <DecisionBadge decision={result.decision} />
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">LTV được duyệt</dt>
              <dd className="font-medium">{(result.approved_ltv * 100).toFixed(1)}%</dd>
              <dt className="text-slate-500">Số tiền tối đa</dt>
              <dd className="font-medium">{result.max_loan.toLocaleString("vi-VN")} VND</dd>
              <dt className="text-slate-500">Kỳ hạn tối đa hệ thống</dt>
              <dd className="font-medium">{result.max_term_days} ngày</dd>
              <dt className="text-slate-500">Lãi suất đề xuất (APR)</dt>
              <dd className="font-medium">{result.interest_rate_apr_pct.toFixed(2)}%/năm</dd>
              <dt className="text-slate-500">Giá trị thanh lý tài sản</dt>
              <dd className="font-medium">{result.liquidation_value.toLocaleString("vi-VN")} VND</dd>
              <dt className="text-slate-500">Hết hạn quyết định</dt>
              <dd className="font-medium">{new Date(result.expires_at).toLocaleString("vi-VN")}</dd>
            </dl>
            {result.reason_codes.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500">Reason codes</div>
                <div className="flex flex-wrap gap-1">
                  {result.reason_codes.map((rc) => (
                    <span key={rc} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{rc}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="text-xs text-slate-400">
              decision_id: {result.decision_id} · {result.policy_version} · {result.model_version}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
