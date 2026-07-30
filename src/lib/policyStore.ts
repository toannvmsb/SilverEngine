import { prisma } from "@/lib/db";
import { DEFAULT_POLICY_CONFIG, RULE_SET_NAME } from "@/lib/engine";
import { PolicyConfig } from "@/lib/engine";

/**
 * Rule Registry access — section 13 "Mọi thay đổi rule/model/source phải
 * maker-checker và lưu diff." A Risk Analyst proposes a new version (inactive),
 * a Risk Approver activates it. Only one version of `silverguard-policy` is
 * ever active at a time.
 */
export async function getActivePolicyConfig(): Promise<{ config: PolicyConfig; version: string }> {
  const active = await prisma.ruleRegistryEntry.findFirst({
    where: { ruleSetName: RULE_SET_NAME, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!active) {
    return { config: DEFAULT_POLICY_CONFIG, version: DEFAULT_POLICY_CONFIG.policyVersion };
  }
  return { config: JSON.parse(active.content) as PolicyConfig, version: active.version };
}

export async function proposePolicyVersion(config: PolicyConfig, approvedBy?: string) {
  return prisma.ruleRegistryEntry.create({
    data: {
      ruleSetName: RULE_SET_NAME,
      version: config.policyVersion,
      content: JSON.stringify(config),
      isActive: false,
      approvedBy: approvedBy ?? null,
    },
  });
}

export async function activatePolicyVersion(id: string, approvedBy: string) {
  await prisma.$transaction([
    prisma.ruleRegistryEntry.updateMany({
      where: { ruleSetName: RULE_SET_NAME, isActive: true },
      data: { isActive: false },
    }),
    prisma.ruleRegistryEntry.update({
      where: { id },
      data: { isActive: true, approvedBy, approvedAt: new Date() },
    }),
  ]);
}

export async function listPolicyVersions() {
  return prisma.ruleRegistryEntry.findMany({
    where: { ruleSetName: RULE_SET_NAME },
    orderBy: { createdAt: "desc" },
  });
}
