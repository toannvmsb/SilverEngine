// Section 13 — Bảo mật, phân quyền và audit (simplified single-tenant RBAC).
export const ROLES = [
  "BRANCH_VIEWER",
  "BRANCH_OPERATOR",
  "RISK_ANALYST",
  "RISK_APPROVER",
  "DATA_ENGINEER",
  "MODEL_DEVELOPER",
  "AUDITOR",
  "SYSTEM_ADMIN",
] as const;

export type RoleName = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  BRANCH_VIEWER: "Branch Viewer",
  BRANCH_OPERATOR: "Branch Operator",
  RISK_ANALYST: "Risk Analyst",
  RISK_APPROVER: "Risk Approver",
  DATA_ENGINEER: "Data Engineer",
  MODEL_DEVELOPER: "Model Developer",
  AUDITOR: "Auditor",
  SYSTEM_ADMIN: "System Admin",
};

// Roles allowed to call the transaction decision API (branch-facing).
export const CAN_SUBMIT_TRANSACTIONS: RoleName[] = ["BRANCH_OPERATOR", "RISK_ANALYST", "RISK_APPROVER", "SYSTEM_ADMIN"];

// Roles allowed to edit/publish policy config (maker-checker: analysts propose, approvers publish).
export const CAN_PROPOSE_POLICY: RoleName[] = ["RISK_ANALYST", "RISK_APPROVER", "SYSTEM_ADMIN"];
export const CAN_APPROVE_POLICY: RoleName[] = ["RISK_APPROVER", "SYSTEM_ADMIN"];

// Roles allowed to enter/adjust manual market observations (data ingestion substitute).
export const CAN_ENTER_MARKET_DATA: RoleName[] = ["DATA_ENGINEER", "RISK_ANALYST", "SYSTEM_ADMIN"];

export const CAN_VIEW_AUDIT: RoleName[] = ["AUDITOR", "RISK_APPROVER", "SYSTEM_ADMIN"];

export function isRoleName(value: string): value is RoleName {
  return (ROLES as readonly string[]).includes(value);
}
