"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/Badges";

export default function PortfolioClient() {
  const router = useRouter();
  const [contractId, setContractId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [weightGram, setWeightGram] = useState("50");
  const [principal, setPrincipal] = useState("10000000");
  const [originalLtv, setOriginalLtv] = useState("0.55");
  const [termDays, setTermDays] = useState("30");
  const [interestRateApr, setInterestRateApr] = useState("20");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function addContract(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const now = new Date();
    const matures = new Date(now.getTime() + Number(termDays) * 86_400_000);
    const res = await fetch("/api/v1/portfolio/contracts/batch-upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contracts: [
          {
            contract_id: contractId || `HD-${Date.now()}`,
            branch_id: "HN01",
            asset_id: assetId || `ASSET-${Date.now()}`,
            weight_gram: Number(weightGram),
            purity: 0.999,
            principal: Number(principal),
            original_ltv: Number(originalLtv),
            term_days: Number(termDays),
            originated_at: now.toISOString(),
            matures_at: matures.toISOString(),
            status: "ACTIVE",
            interest_rate_apr: Number(interestRateApr),
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "FORBIDDEN" ? "Bạn không có quyền thêm hợp đồng." : JSON.stringify(body));
      return;
    }
    setMessage("Đã thêm hợp đồng.");
    router.refresh();
  }

  async function runStressTest() {
    setRunning(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/v1/stress-tests/run", { method: "POST" });
    setRunning(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Có lỗi khi chạy stress test.");
      return;
    }
    const body = await res.json();
    setMessage(`Đã revalue ${body.contracts_evaluated} hợp đồng — CRITICAL: ${body.critical}, HIGH: ${body.high}, WARNING: ${body.warning}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}

      <Card title="Thêm hợp đồng (thay cho Pawn Core CDC)">
        <form onSubmit={addContract} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Mã hợp đồng</label>
            <input value={contractId} onChange={(e) => setContractId(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="tự sinh nếu để trống" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Mã tài sản</label>
            <input value={assetId} onChange={(e) => setAssetId(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" placeholder="tự sinh nếu để trống" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Khối lượng (gram)</label>
            <input value={weightGram} onChange={(e) => setWeightGram(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Gốc vay (VND)</label>
            <input value={principal} onChange={(e) => setPrincipal(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">LTV gốc</label>
            <input value={originalLtv} onChange={(e) => setOriginalLtv(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Kỳ hạn (ngày)</label>
            <input value={termDays} onChange={(e) => setTermDays(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Lãi suất APR %</label>
            <input value={interestRateApr} onChange={(e) => setInterestRateApr(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded bg-slate-900 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
              Thêm
            </button>
          </div>
        </form>
      </Card>

      <button
        onClick={runStressTest}
        disabled={running}
        className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
      >
        {running ? "Đang chạy..." : "Chạy Stress Test (-10/-20/-30%) & Revalue"}
      </button>
    </div>
  );
}
