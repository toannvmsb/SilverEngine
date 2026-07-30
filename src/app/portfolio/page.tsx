import { prisma } from "@/lib/db";
import { Card, AlertBadge } from "@/components/Badges";
import PortfolioClient from "./PortfolioClient";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const contracts = await prisma.portfolioContract.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  const rows = await Promise.all(
    contracts.map(async (c) => ({
      contract: c,
      valuation: await prisma.portfolioValuation.findFirst({ where: { contractId: c.contractId }, orderBy: { asOf: "desc" } }),
    }))
  );
  const totalPrincipal = contracts.reduce((s, c) => s + c.principal, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Portfolio Monitoring</h1>
        <p className="text-sm text-slate-500">
          Revalue toàn bộ tài sản theo giá mua lại mới, current/stressed LTV, maturity ladder và
          action list (section 9).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Hợp đồng đang hoạt động">
          <div className="text-2xl font-bold">{contracts.length}</div>
        </Card>
        <Card title="Tổng dư nợ gốc">
          <div className="text-2xl font-bold">{totalPrincipal.toLocaleString("vi-VN")} VND</div>
        </Card>
        <Card title="Hợp đồng đã revalue">
          <div className="text-2xl font-bold">{rows.filter((r) => r.valuation).length}</div>
        </Card>
      </div>

      <PortfolioClient />

      <Card title="Danh sách hợp đồng">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2">Hợp đồng</th>
              <th className="py-2">Kỳ hạn</th>
              <th className="py-2">Gốc vay</th>
              <th className="py-2">LTV hiện tại</th>
              <th className="py-2">Stressed LTV -20%</th>
              <th className="py-2">Cảnh báo</th>
              <th className="py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ contract, valuation }) => (
              <tr key={contract.id} className="border-b last:border-0">
                <td className="py-2">{contract.contractId}</td>
                <td className="py-2">{contract.termDays}d</td>
                <td className="py-2">{contract.principal.toLocaleString("vi-VN")}</td>
                <td className="py-2">{valuation ? `${(valuation.currentLtv * 100).toFixed(1)}%` : "—"}</td>
                <td className="py-2">{valuation ? `${(valuation.stressedLtv20 * 100).toFixed(1)}%` : "—"}</td>
                <td className="py-2">{valuation?.alertLevel ? <AlertBadge level={valuation.alertLevel} /> : "—"}</td>
                <td className="py-2 text-xs text-slate-500">{valuation?.action ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-slate-400">
                  Chưa có hợp đồng nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
