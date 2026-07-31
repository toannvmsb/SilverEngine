import { prisma } from "@/lib/db";
import { Card, RegimeBadge, TermStatusBadge, AlertBadge } from "@/components/Badges";
import { Regime, TermPolicy } from "@/lib/engine";
import Link from "next/link";
import AcknowledgeAlertButton from "./AcknowledgeAlertButton";

export const dynamic = "force-dynamic";

export default async function ExecutivePage() {
  const [snapshot, alerts, sources] = await Promise.all([
    prisma.policySnapshot.findFirst({ orderBy: { asOf: "desc" } }),
    prisma.alertEvent.findMany({ where: { acknowledged: false }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.sourceRegistry.findMany(),
  ]);

  if (!snapshot) {
    return (
      <Card title="Chưa có dữ liệu">
        <p className="text-sm text-slate-600">
          Hệ thống chưa có snapshot chính sách nào. Vào{" "}
          <Link href="/market" className="font-medium text-blue-600 underline">
            Market Data
          </Link>{" "}
          để nhập dữ liệu thị trường đầu tiên.
        </p>
      </Card>
    );
  }

  const terms = JSON.parse(snapshot.terms) as TermPolicy[];
  const reasonCodes = JSON.parse(snapshot.reasonCodes) as string[];
  const ageMinutes = (Date.now() - snapshot.asOf.getTime()) / 60000;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card title="Risk Score">
          <div className="text-3xl font-bold text-slate-800">{snapshot.riskScore.toFixed(1)}</div>
          <div className="text-xs text-slate-400">0–100, càng cao càng rủi ro</div>
        </Card>
        <Card title="Regime">
          <RegimeBadge regime={snapshot.regime as Regime} />
        </Card>
        <Card title="Data Quality Score">
          <div className="text-3xl font-bold text-slate-800">{snapshot.dataQualityScore}</div>
          <div className="text-xs text-slate-400">Cập nhật {ageMinutes.toFixed(0)} phút trước</div>
        </Card>
        <Card title="Policy / Model Version">
          <div className="text-sm font-medium">{snapshot.policyVersion}</div>
          <div className="text-xs text-slate-400">{snapshot.modelVersion}</div>
        </Card>
      </div>

      <Card title="Giá định giá bạc (tham chiếu)">
        <div className="text-3xl font-bold text-slate-800">
          {snapshot.referencePricePerGram.toLocaleString("vi-VN")} <span className="text-base font-normal text-slate-400">VND/gram</span>
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Giá mua vào Phú Quý đã áp hệ số thanh khoản theo trạng thái mua lại hiện tại — <strong>chưa</strong> trừ
          quality_factor (seal/serial), số cụ thể theo từng tài sản tính ở trang Calculator.
        </div>
      </Card>

      <Card title={`Chính sách hôm nay — as of ${snapshot.asOf.toLocaleString("vi-VN")}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-500">
              <th className="py-2">Kỳ hạn (ngày)</th>
              <th className="py-2">LTV cap</th>
              <th className="py-2">Cho vay tối đa/gram</th>
              <th className="py-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {terms.map((t) => (
              <tr key={t.days} className="border-b last:border-0">
                <td className="py-2">{t.days}</td>
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
        {reasonCodes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {reasonCodes.map((rc) => (
              <span key={rc} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {rc}
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card title="Critical / active alerts">
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-400">Không có cảnh báo đang mở.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-2 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertBadge level={a.level} />
                    <span className="text-slate-700">{a.message}</span>
                  </div>
                  <AcknowledgeAlertButton id={a.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Source health">
          {sources.length === 0 ? (
            <p className="text-sm text-slate-400">
              Chưa cấu hình nguồn dữ liệu (source_registry). Xem README để seed.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {sources.map((s) => (
                <li key={s.id} className="flex items-center justify-between">
                  <span>{s.sourceName}</span>
                  <span className="text-xs text-slate-400">{s.method}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
