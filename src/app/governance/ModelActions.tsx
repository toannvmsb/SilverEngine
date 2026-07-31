"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunChallengersButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/models/run-challengers", { method: "POST" });
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(body.error === "FORBIDDEN" ? "Bạn không có quyền chạy challenger model." : JSON.stringify(body));
      return;
    }
    const parts: string[] = [];
    parts.push(body.gjrGarch.ran ? "GJR-GARCH: OK" : `GJR-GARCH: bỏ qua (${body.gjrGarch.reason})`);
    parts.push(body.conditionalQuantiles.ran ? "Quantiles: OK" : `Quantiles: bỏ qua (${body.conditionalQuantiles.reason})`);
    setMessage(parts.join(" · "));
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={loading}
        className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {loading ? "Đang chạy..." : "Chạy Challenger Models"}
      </button>
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
    </div>
  );
}

export function PromoteButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function promote() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/models/${id}/promote`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "FORBIDDEN" ? "Chỉ Risk Approver mới được promote model." : "Lỗi");
      return;
    }
    router.refresh();
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button onClick={promote} disabled={loading} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50">
        {loading ? "..." : "Promote"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
