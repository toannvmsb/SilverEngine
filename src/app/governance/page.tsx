import { prisma } from "@/lib/db";
import { Card } from "@/components/Badges";
import { RunChallengersButton, PromoteButton } from "./ModelActions";

export const dynamic = "force-dynamic";

interface GjrGarchMetrics {
  params: { omega: number; alpha: number; beta: number; gamma: number };
  logLikelihood: number;
  converged: boolean;
  observations: number;
  forecastVolByHorizon: Record<string, number>;
  championEwmaVolByHorizon: Record<string, number | null>;
}

interface QuantileMetrics {
  quantilesByHorizon: {
    horizonDays: number;
    q1: number;
    q25: number;
    q5: number;
    method: string;
    bucket: string | null;
    sampleSize: number;
  }[];
}

export default async function GovernancePage() {
  const [garchEntries, quantileEntries, policyVersions] = await Promise.all([
    prisma.modelRegistryEntry.findMany({ where: { modelName: "GJR-GARCH-1-1" }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.modelRegistryEntry.findMany({ where: { modelName: "REGIME-CONDITIONAL-QUANTILES" }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.ruleRegistryEntry.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const latestGarch = garchEntries[0];
  const latestQuantile = quantileEntries[0];
  const garchMetrics: GjrGarchMetrics | null = latestGarch ? JSON.parse(latestGarch.metrics ?? "null") : null;
  const quantileMetrics: QuantileMetrics | null = latestQuantile ? JSON.parse(latestQuantile.metrics ?? "null") : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Model Governance</h1>
        <p className="text-sm text-slate-500">
          Champion/challenger, backtest, drift, versions, approvals (section 12 &amp; 14). Champion hiện tại
          cho vol/haircut trong quyết định LTV vẫn là <strong>EWMA</strong> (section 8) — các model dưới đây
          là <strong>challenger</strong>, không tự động ảnh hưởng LTV cho tới khi có quyết định promote +
          sửa code nối vào decision engine.
        </p>
      </div>

      <RunChallengersButton />

      <Card title="GJR-GARCH(1,1) — asymmetric volatility forecast (challenger)">
        {!latestGarch || !garchMetrics ? (
          <p className="text-sm text-slate-400">
            Chưa có kết quả — cần tích luỹ đủ lịch sử giá bạc quốc tế (SILVER_SPOT_USD, cần ≥40 ngày). Bấm
            &quot;Chạy Challenger Models&quot; sau khi có đủ dữ liệu (bật GoldAPI connector + chạy scheduler
            vài tuần).
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span>Version: {latestGarch.version}</span>
              <span>Quan sát: {garchMetrics.observations} ngày</span>
              <span>Converged: {garchMetrics.converged ? "✓" : "✗ (kết quả có thể không tối ưu)"}</span>
              <span>Log-likelihood: {garchMetrics.logLikelihood.toFixed(1)}</span>
              {latestGarch.isChampion ? (
                <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">CHAMPION</span>
              ) : (
                <PromoteButton id={latestGarch.id} />
              )}
            </div>
            <div className="text-xs text-slate-500">
              ω={garchMetrics.params.omega.toExponential(3)} · α={garchMetrics.params.alpha.toFixed(4)} · β=
              {garchMetrics.params.beta.toFixed(4)} · γ={garchMetrics.params.gamma.toFixed(4)} (persistence α+β+γ/2=
              {(garchMetrics.params.alpha + garchMetrics.params.beta + garchMetrics.params.gamma / 2).toFixed(4)})
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-1.5">Horizon</th>
                  <th className="py-1.5">GJR-GARCH vol (challenger)</th>
                  <th className="py-1.5">EWMA vol (champion, flat)</th>
                  <th className="py-1.5">Chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(garchMetrics.forecastVolByHorizon).map(([h, vol]) => {
                  const champion = garchMetrics.championEwmaVolByHorizon[h];
                  const diff = champion !== null && champion !== undefined ? vol - champion : null;
                  return (
                    <tr key={h} className="border-b last:border-0">
                      <td className="py-1.5">{h} ngày</td>
                      <td className="py-1.5">{(vol * 100).toFixed(1)}%</td>
                      <td className="py-1.5">{champion !== null && champion !== undefined ? `${(champion * 100).toFixed(1)}%` : "—"}</td>
                      <td className="py-1.5">{diff !== null ? `${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(1)}pt` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Regime-Conditional Quantiles — tail return forecast (challenger)">
        {!latestQuantile || !quantileMetrics ? (
          <p className="text-sm text-slate-400">Chưa có kết quả — tương tự, cần đủ lịch sử giá.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span>Version: {latestQuantile.version}</span>
              {latestQuantile.isChampion ? (
                <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">CHAMPION</span>
              ) : (
                <PromoteButton id={latestQuantile.id} />
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="py-1.5">Horizon</th>
                  <th className="py-1.5">q1%</th>
                  <th className="py-1.5">q2.5%</th>
                  <th className="py-1.5">q5%</th>
                  <th className="py-1.5">Phương pháp</th>
                  <th className="py-1.5">Mẫu</th>
                </tr>
              </thead>
              <tbody>
                {quantileMetrics.quantilesByHorizon.map((q) => (
                  <tr key={q.horizonDays} className="border-b last:border-0">
                    <td className="py-1.5">{q.horizonDays} ngày</td>
                    <td className="py-1.5">{(q.q1 * 100).toFixed(1)}%</td>
                    <td className="py-1.5">{(q.q25 * 100).toFixed(1)}%</td>
                    <td className="py-1.5">{(q.q5 * 100).toFixed(1)}%</td>
                    <td className="py-1.5 text-xs text-slate-500">
                      {q.method === "regime_conditional" ? `conditional (${q.bucket})` : "unconditional fallback"}
                    </td>
                    <td className="py-1.5 text-xs text-slate-500">{q.sampleSize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Rule Registry — phiên bản Policy gần đây">
        <p className="mb-2 text-xs text-slate-500">
          Quản lý đầy đủ (đề xuất/kích hoạt) ở trang <a href="/policy" className="text-blue-600 underline">Policy</a>.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-1.5">Version</th>
              <th className="py-1.5">Trạng thái</th>
              <th className="py-1.5">Approved by</th>
              <th className="py-1.5">Tạo lúc</th>
            </tr>
          </thead>
          <tbody>
            {policyVersions.map((v) => (
              <tr key={v.id} className="border-b last:border-0">
                <td className="py-1.5">{v.version}</td>
                <td className="py-1.5">{v.isActive ? "ACTIVE" : "pending"}</td>
                <td className="py-1.5">{v.approvedBy ?? "—"}</td>
                <td className="py-1.5 text-xs text-slate-400">{v.createdAt.toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
