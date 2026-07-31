"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcknowledgeAlertButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function acknowledge() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/alerts/${id}/acknowledge`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "FORBIDDEN" ? "Không có quyền" : "Lỗi");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={acknowledge}
        disabled={loading}
        className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50"
      >
        {loading ? "..." : "Acknowledge"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
