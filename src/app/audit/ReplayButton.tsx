"use client";

import { useState } from "react";

export default function ReplayButton({ decisionId }: { decisionId: string }) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function replay() {
    setLoading(true);
    const res = await fetch(`/api/audit/replay/${decisionId}`, { method: "POST" });
    const body = await res.json();
    setLoading(false);
    setResult(body.matches ? "MATCH ✓" : "MISMATCH ✗");
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={replay} disabled={loading} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50">
        {loading ? "..." : "Replay"}
      </button>
      {result && (
        <span className={`text-xs font-medium ${result.includes("MATCH") ? "text-green-600" : "text-red-600"}`}>{result}</span>
      )}
    </div>
  );
}
