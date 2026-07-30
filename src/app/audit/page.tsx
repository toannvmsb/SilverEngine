import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, DecisionBadge } from "@/components/Badges";
import { CAN_VIEW_AUDIT, RoleName } from "@/lib/roles";
import { DecisionState } from "@/lib/engine";
import ReplayButton from "./ReplayButton";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role as RoleName | undefined;

  if (!role || !CAN_VIEW_AUDIT.includes(role)) {
    return (
      <Card title="Không có quyền truy cập">
        <p className="text-sm text-slate-500">
          Chỉ Auditor / Risk Approver / System Admin được xem Audit log (section 13).
        </p>
      </Card>
    );
  }

  const decisions = await prisma.decisionLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Audit — Decision lookup &amp; replay</h1>
        <p className="text-sm text-slate-500">
          Mỗi quyết định lưu input snapshot, model/rule/policy version — replay để xác nhận tái lập
          được 100% (section 15 &quot;Replay&quot; acceptance KPI).
        </p>
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2">Thời gian</th>
              <th className="py-2">Asset</th>
              <th className="py-2">Kỳ hạn</th>
              <th className="py-2">Số tiền YC</th>
              <th className="py-2">Quyết định</th>
              <th className="py-2">LTV</th>
              <th className="py-2">Max loan</th>
              <th className="py-2">Versions</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr key={d.id} className="border-b last:border-0 align-top">
                <td className="py-2 text-xs text-slate-500">{d.createdAt.toLocaleString("vi-VN")}</td>
                <td className="py-2">{d.assetId}</td>
                <td className="py-2">{d.requestedTermDays}d</td>
                <td className="py-2">{d.requestedAmount.toLocaleString("vi-VN")}</td>
                <td className="py-2">
                  <DecisionBadge decision={d.decision as DecisionState} />
                </td>
                <td className="py-2">{(d.approvedLtv * 100).toFixed(1)}%</td>
                <td className="py-2">{d.maxLoan.toLocaleString("vi-VN")}</td>
                <td className="py-2 text-xs text-slate-400">
                  {d.policyVersion} / {d.modelVersion}
                </td>
                <td className="py-2">
                  <ReplayButton decisionId={d.decisionId} />
                </td>
              </tr>
            ))}
            {decisions.length === 0 && (
              <tr>
                <td colSpan={9} className="py-4 text-center text-slate-400">
                  Chưa có quyết định nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
