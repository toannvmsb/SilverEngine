import { Regime, TermStatus, DecisionState } from "@/lib/engine";

const REGIME_STYLE: Record<Regime, string> = {
  LOW: "bg-green-100 text-green-800 border-green-300",
  NORMAL: "bg-emerald-100 text-emerald-800 border-emerald-300",
  CAUTIOUS: "bg-yellow-100 text-yellow-800 border-yellow-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  STRESS: "bg-red-100 text-red-800 border-red-300",
  CRISIS: "bg-red-200 text-red-900 border-red-400",
};

export function RegimeBadge({ regime }: { regime: Regime }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${REGIME_STYLE[regime]}`}>
      {regime}
    </span>
  );
}

const TERM_STATUS_STYLE: Record<TermStatus, string> = {
  OPEN: "bg-green-100 text-green-800 border-green-300",
  LIMITED: "bg-yellow-100 text-yellow-800 border-yellow-300",
  REFER: "bg-orange-100 text-orange-800 border-orange-300",
  STOP: "bg-red-100 text-red-800 border-red-300",
};

export function TermStatusBadge({ status }: { status: TermStatus }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${TERM_STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

const DECISION_STYLE: Record<DecisionState, string> = {
  APPROVE: "bg-green-100 text-green-800 border-green-300",
  REFER: "bg-orange-100 text-orange-800 border-orange-300",
  DECLINE: "bg-red-100 text-red-800 border-red-300",
  STOP_NEW_LOANS: "bg-red-200 text-red-900 border-red-400",
};

export function DecisionBadge({ decision }: { decision: DecisionState }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${DECISION_STYLE[decision]}`}>
      {decision}
    </span>
  );
}

const ALERT_STYLE: Record<string, string> = {
  INFO: "bg-blue-100 text-blue-800 border-blue-300",
  WARNING: "bg-yellow-100 text-yellow-800 border-yellow-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  CRITICAL: "bg-red-100 text-red-800 border-red-300",
};

export function AlertBadge({ level }: { level: string }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${ALERT_STYLE[level] ?? ""}`}>
      {level}
    </span>
  );
}

export function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className ?? ""}`}>
      {title && <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>}
      {children}
    </div>
  );
}
