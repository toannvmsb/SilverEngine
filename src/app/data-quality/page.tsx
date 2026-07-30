import { prisma } from "@/lib/db";
import { Card } from "@/components/Badges";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  OK: "bg-green-100 text-green-800 border-green-300",
  STALE: "bg-yellow-100 text-yellow-800 border-yellow-300",
  NO_DATA: "bg-slate-100 text-slate-600 border-slate-300",
  DISABLED: "bg-slate-100 text-slate-500 border-slate-300",
};

const LOG_STATUS_STYLE: Record<string, string> = {
  OK: "bg-green-100 text-green-800",
  FAIL: "bg-red-100 text-red-800",
  INVALID: "bg-orange-100 text-orange-800",
  SKIPPED_NOT_CONFIGURED: "bg-slate-100 text-slate-600",
};

export default async function DataQualityPage() {
  const sources = await prisma.sourceRegistry.findMany({ orderBy: { priority: "asc" } });
  const quote = await prisma.phuQuyQuote.findFirst({ orderBy: { sourceTime: "desc" } });
  const feature = await prisma.featureSnapshot.findFirst({ orderBy: { asOf: "desc" } });
  const recentLogs = await prisma.rawIngestionLog.findMany({ orderBy: { createdAt: "desc" }, take: 60 });

  const health = sources.map((s) => {
    let ageSeconds: number | null = null;
    if (s.sourceId === "PHUQUY_BUYBACK" && quote) ageSeconds = (Date.now() - quote.sourceTime.getTime()) / 1000;
    if (s.dataDomain !== "phuquy" && feature) ageSeconds = (Date.now() - feature.asOf.getTime()) / 1000;
    const stale = ageSeconds !== null && ageSeconds > s.staleAfterSeconds;
    const status = !s.enabled ? "DISABLED" : ageSeconds === null ? "NO_DATA" : stale ? "STALE" : "OK";

    const logsForSource = recentLogs.filter((l) => l.sourceId === s.sourceId);
    const last10 = logsForSource.slice(0, 10);
    const failCount = last10.filter((l) => l.status === "FAIL").length;

    return { source: s, ageSeconds, status, logsForSource, failCount, last10 };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Data Quality</h1>
        <p className="text-sm text-slate-500">
          Freshness, failures, parser confidence theo từng nguồn (section 12). Đối chiếu với Source
          Registry (section 4.1) và nhật ký raw_ingestion_log (section 5).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {health.map((h) => (
          <Card key={h.source.id}>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">{h.source.sourceName}</div>
                <div className="text-xs text-slate-400">
                  {h.source.sourceId} · {h.source.method} · {h.source.licenseStatus}
                </div>
              </div>
              <span className={`rounded border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[h.status]}`}>{h.status}</span>
            </div>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-slate-500">Freshness</dt>
              <dd>{h.ageSeconds !== null ? `${Math.round(h.ageSeconds)}s (ngưỡng ${h.source.staleAfterSeconds}s)` : "—"}</dd>
              <dt className="text-slate-500">Fail (10 lần gần nhất)</dt>
              <dd>
                {h.logsForSource.length > 0 ? `${h.failCount}/${h.last10.length}` : "chưa có log"}
              </dd>
            </dl>
            {h.source.credentialSecretRef && (
              <p className="mt-2 text-xs text-slate-400">{h.source.credentialSecretRef}</p>
            )}
          </Card>
        ))}
      </div>

      <Card title="Nhật ký ingestion gần đây (raw_ingestion_log)">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2">Thời gian</th>
              <th className="py-2">Nguồn</th>
              <th className="py-2">Trạng thái</th>
              <th className="py-2">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.map((l) => (
              <tr key={l.id} className="border-b last:border-0 align-top">
                <td className="py-2 text-xs text-slate-500 whitespace-nowrap">{l.createdAt.toLocaleString("vi-VN")}</td>
                <td className="py-2 font-medium">{l.sourceId}</td>
                <td className="py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${LOG_STATUS_STYLE[l.status] ?? ""}`}>{l.status}</span>
                </td>
                <td className="py-2 text-xs text-slate-600">{l.errorMessage ?? "—"}</td>
              </tr>
            ))}
            {recentLogs.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-400">
                  Chưa có log — bấm &quot;Làm mới từ API&quot; ở Market Data hoặc chạy `npm run scheduler`.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
