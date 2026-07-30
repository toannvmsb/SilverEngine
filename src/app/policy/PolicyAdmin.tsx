"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/Badges";
import { PolicyConfig } from "@/lib/engine";

interface VersionRow {
  id: string;
  version: string;
  isActive: boolean;
  approvedBy: string | null;
  createdAt: string;
}

export default function PolicyAdmin() {
  const [active, setActive] = useState<PolicyConfig | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [json, setJson] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/policy-config");
    const body = await res.json();
    setActive(body.active.config);
    setJson(JSON.stringify(body.active.config, null, 2));
    setVersions(body.versions);
  }

  useEffect(() => {
    load();
  }, []);

  async function propose() {
    setError(null);
    setMessage(null);
    let parsed: PolicyConfig;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError("JSON không hợp lệ.");
      return;
    }
    const res = await fetch("/api/policy-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "FORBIDDEN" ? "Bạn không có quyền đề xuất policy." : JSON.stringify(body));
      return;
    }
    setMessage("Đã đề xuất phiên bản mới — cần Risk Approver kích hoạt.");
    load();
  }

  async function activate(id: string) {
    setError(null);
    const res = await fetch(`/api/policy-config/${id}/activate`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === "FORBIDDEN" ? "Chỉ Risk Approver mới được kích hoạt policy." : JSON.stringify(body));
      return;
    }
    setMessage("Đã kích hoạt policy version.");
    load();
  }

  if (!active) return null;

  return (
    <div className="space-y-4">
      <Card title="Phiên bản Policy (Rule Registry)">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-1.5">Version</th>
              <th className="py-1.5">Trạng thái</th>
              <th className="py-1.5">Approved by</th>
              <th className="py-1.5">Tạo lúc</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} className="border-b last:border-0">
                <td className="py-1.5">{v.version}</td>
                <td className="py-1.5">{v.isActive ? "ACTIVE" : "pending"}</td>
                <td className="py-1.5">{v.approvedBy ?? "—"}</td>
                <td className="py-1.5 text-xs text-slate-400">{new Date(v.createdAt).toLocaleString("vi-VN")}</td>
                <td className="py-1.5">
                  {!v.isActive && (
                    <button
                      onClick={() => activate(v.id)}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100"
                    >
                      Kích hoạt
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Đề xuất cấu hình mới (maker-checker: Risk Analyst đề xuất, Risk Approver kích hoạt)">
        {error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p className="mb-2 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        <p className="mb-2 text-xs text-slate-500">
          Sửa <code>policyVersion</code> thành một mã mới (vd POL-1.1) trước khi đề xuất — mỗi version phải
          duy nhất.
        </p>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={20}
          className="w-full rounded border border-slate-300 p-2 font-mono text-xs"
        />
        <button
          onClick={propose}
          className="mt-2 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Đề xuất phiên bản
        </button>
      </Card>
    </div>
  );
}
