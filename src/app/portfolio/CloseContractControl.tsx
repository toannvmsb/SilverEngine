"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const OPTIONS = [
  { value: "REDEEMED", label: "Tất toán (Redeemed)" },
  { value: "LIQUIDATED", label: "Thanh lý (Liquidated)" },
  { value: "DEFAULT", label: "Vỡ nợ (Default)" },
];

export default function CloseContractControl({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(OPTIONS[0].value);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    if (!confirm(`Đóng hợp đồng ${contractId} với trạng thái "${OPTIONS.find((o) => o.value === status)?.label}"?`)) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/v1/portfolio/contracts/${contractId}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "FORBIDDEN" ? "Không có quyền" : "Lỗi");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded border border-slate-300 px-1 py-0.5 text-xs"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button onClick={close} disabled={loading} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50">
        {loading ? "..." : "Đóng"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
