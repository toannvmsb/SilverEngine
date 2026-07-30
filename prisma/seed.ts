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
  }[] = [
    { sourceId: "PHUQUY_BUYBACK", sourceName: "Phú Quý buy/sell/spread", dataDomain: "phuquy", method: "MANUAL", staleAfterSeconds: 1800, priority: 1, ownerTeam: "Data" },
    { sourceId: "SILVER_MARKET", sourceName: "Silver/Gold/Copper spot", dataDomain: "metals", method: "MANUAL", staleAfterSeconds: 3600, priority: 1, ownerTeam: "Data" },
    { sourceId: "FX_DXY", sourceName: "USD/VND, DXY", dataDomain: "fx", method: "MANUAL", staleAfterSeconds: 3600, priority: 2, ownerTeam: "Data" },
    { sourceId: "FRED_YIELDS", sourceName: "US 2Y/10Y yields, real yield", dataDomain: "rates", method: "MANUAL", staleAfterSeconds: 86400, priority: 2, ownerTeam: "Data" },
    { sourceId: "MACRO_RELEASES", sourceName: "CPI, PCE, PMI, payrolls", dataDomain: "macro", method: "MANUAL", staleAfterSeconds: 86400, priority: 3, ownerTeam: "Data" },
    { sourceId: "CFTC_COT", sourceName: "CFTC COT silver futures/options", dataDomain: "positioning", method: "MANUAL", staleAfterSeconds: 604800, priority: 3, ownerTeam: "Data" },
    { sourceId: "ECON_CALENDAR", sourceName: "Fed/CPI/payroll/expiry/margin notices", dataDomain: "events", method: "MANUAL", staleAfterSeconds: 3600, priority: 3, ownerTeam: "Risk" },
  ];
  for (const s of sources) {
    await prisma.sourceRegistry.upsert({
      where: { sourceId: s.sourceId },
      create: { ...s, licenseStatus: "PENDING", enabled: true, expectedLatencySeconds: 300 },
      update: {},
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
