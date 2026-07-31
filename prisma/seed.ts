import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_POLICY_CONFIG, RULE_SET_NAME } from "../src/lib/engine/constants";

const prisma = new PrismaClient();

async function upsertUser(email: string, name: string, role: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    create: { email, name, role, passwordHash },
    update: { name, role, passwordHash },
  });
}

async function main() {
  // Section 13 — one seed user per role family, all with clearly-labeled
  // dev-only passwords. Change these before any real deployment.
  await upsertUser("admin@silverguard.local", "System Admin", "SYSTEM_ADMIN", "ChangeMe123!");
  await upsertUser("risk.approver@silverguard.local", "Risk Approver", "RISK_APPROVER", "ChangeMe123!");
  await upsertUser("risk.analyst@silverguard.local", "Risk Analyst", "RISK_ANALYST", "ChangeMe123!");
  await upsertUser("branch.operator@silverguard.local", "Branch Operator (HN01)", "BRANCH_OPERATOR", "ChangeMe123!");
  await upsertUser("auditor@silverguard.local", "Auditor", "AUDITOR", "ChangeMe123!");

  // Section 4 Source Registry — metadata only; no credentials/URLs are
  // populated because none of these are licensed/approved yet (section 4
  // "Yêu cầu pháp lý dữ liệu"). Enable + fill in credential_secret_ref once
  // Legal/Procurement approves each source and a connector is built.
  const sources: {
    sourceId: string;
    sourceName: string;
    dataDomain: string;
    method: string;
    staleAfterSeconds: number;
    priority: number;
    ownerTeam: string;
    licenseStatus: string;
    credentialSecretRef: string | null;
  }[] = [
    { sourceId: "PHUQUY_BUYBACK", sourceName: "Phú Quý buy/sell/spread", dataDomain: "phuquy", method: "API", staleAfterSeconds: 1800, priority: 1, ownerTeam: "Data", licenseStatus: "PENDING", credentialSecretRef: "PHUQUY_QUOTE_API_ENABLED=true (API nội bộ be.phuquy.com.vn, không cần key — cần xác nhận với Phú Quý/Legal trước khi bật, section 4.2)" },
    { sourceId: "SILVER_MARKET", sourceName: "Silver/Gold spot", dataDomain: "metals", method: "API", staleAfterSeconds: 3600, priority: 1, ownerTeam: "Data", licenseStatus: "PENDING", credentialSecretRef: "GOLDAPI_KEY (goldapi.io free-tier — xác nhận điều khoản gói đã đăng ký)" },
    { sourceId: "FX_DXY", sourceName: "USD/VND, DXY", dataDomain: "fx", method: "MANUAL", staleAfterSeconds: 3600, priority: 2, ownerTeam: "Data", licenseStatus: "NOT_REQUIRED", credentialSecretRef: null },
    { sourceId: "FRED_YIELDS", sourceName: "US 10Y real yield, broad dollar index", dataDomain: "rates", method: "API", staleAfterSeconds: 86400, priority: 2, ownerTeam: "Data", licenseStatus: "NOT_REQUIRED", credentialSecretRef: "FRED_API_KEY (miễn phí, tự đăng ký tại fred.stlouisfed.org)" },
    { sourceId: "MACRO_RELEASES", sourceName: "CPI, PCE, PMI, payrolls", dataDomain: "macro", method: "MANUAL", staleAfterSeconds: 86400, priority: 3, ownerTeam: "Data", licenseStatus: "NOT_REQUIRED", credentialSecretRef: null },
    { sourceId: "CFTC_COT", sourceName: "CFTC COT silver futures/options", dataDomain: "positioning", method: "API", staleAfterSeconds: 604800, priority: 3, ownerTeam: "Data", licenseStatus: "NOT_REQUIRED", credentialSecretRef: "CFTC_COT_ENABLED=true (chặn theo IP/quốc gia từ VN, đã xác nhận — thử lại nếu deploy server ở Mỹ)" },
    { sourceId: "ECON_CALENDAR", sourceName: "Fed/CPI/payroll/expiry/margin notices", dataDomain: "events", method: "MANUAL", staleAfterSeconds: 3600, priority: 3, ownerTeam: "Risk", licenseStatus: "NOT_REQUIRED", credentialSecretRef: null },
  ];
  for (const s of sources) {
    const { licenseStatus, ...rest } = s;
    await prisma.sourceRegistry.upsert({
      where: { sourceId: s.sourceId },
      create: { ...rest, licenseStatus, enabled: true, expectedLatencySeconds: 300 },
      update: { method: s.method, licenseStatus, credentialSecretRef: s.credentialSecretRef, staleAfterSeconds: s.staleAfterSeconds },
    });
  }

  // Initial active policy version (section 18.2 sample config)
  const existingActive = await prisma.ruleRegistryEntry.findFirst({
    where: { ruleSetName: RULE_SET_NAME, isActive: true },
  });
  if (!existingActive) {
    await prisma.ruleRegistryEntry.create({
      data: {
        ruleSetName: RULE_SET_NAME,
        version: DEFAULT_POLICY_CONFIG.policyVersion,
        content: JSON.stringify(DEFAULT_POLICY_CONFIG),
        isActive: true,
        approvedBy: "seed",
        approvedAt: new Date(),
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
