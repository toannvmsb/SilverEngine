import { prisma } from "@/lib/db";
import { Card, RegimeBadge, TermStatusBadge } from "@/components/Badges";
import { Regime, TermPolicy } from "@/lib/engine";
import PolicyAdmin from "./PolicyAdmin";

export const dynamic = "force-dynamic";

export default async function PolicyPage() {
  const snapshot = await prisma.policySnapshot.findFirst({ orderBy: { asOf: "desc" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Policy — GET /v1/policies/current</h1>
        <p className="text-sm text-slate-500">
          LTV/kỳ hạn theo product/branch, reason codes và effective time (section 10.1 &amp; 12).
        </p>
      </div>

      {snapshot ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <RegimeBadge regime={snapshot.regime as Regime} />
            <span className="text-sm text-slate-600">Risk Score: {snapshot.riskScore.toFixed(1)}</span>
            <span className="text-sm text-slate-600">
              Effective: {snapshot.asOf.toLocaleString("vi-VN")}
            </span>
            <span className="text-sm text-slate-600">{snapshot.policyVersion}</span>
            <span className="text-sm text-slate-600">
              Giá định giá: <strong>{snapshot.referencePricePerGram.toLocaleString("vi-VN")} VND/gram</strong>
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2">Kỳ hạn</th>
                <th className="py-2">LTV cap</th>
                <th className="py-2">Cho vay tối đa/gram</th>
                <th className="py-2">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {(JSON.parse(snapshot.terms) as TermPolicy[]).map((t) => (
                <tr key={t.days} className="border-b last:border-0">
                  <td className="py-2">{t.days} ngày</td>
                  <td className="py-2">{(t.ltvCap * 100).toFixed(1)}%</td>
                  <td className="py-2">
                    {Math.round(snapshot.referencePricePerGram * t.ltvCap).toLocaleString("vi-VN")} VND
                  </td>
                  <td className="py-2">
                    <TermStatusBadge status={t.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-slate-500">Chưa có policy snapshot — hãy nhập Market Data trước.</p>
        </Card>
      )}

      <PolicyAdmin />
    </div>
  );
}
