import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActivePolicyConfig, listPolicyVersions, proposePolicyVersion } from "@/lib/policyStore";
import { requireRole } from "@/lib/apiAuth";
import { CAN_PROPOSE_POLICY, CAN_VIEW_GENERAL_DATA } from "@/lib/roles";
import { PolicyConfig } from "@/lib/engine";

// Bounds-checked mirror of PolicyConfig (src/lib/engine/types.ts). Every
// other write endpoint in the app validates its body with zod; this one
// previously only checked policyVersion was truthy and cast the rest of the
// client JSON straight to PolicyConfig, so a proposed config with e.g.
// globalLtvCap: 5 or a negative safetyBufferPct would sail through with no
// technical ceiling — the only thing standing between that and a live loan
// approving far more than collateral value was a human re-checking every
// number by eye before activating it (found in security review).
const percentage = z.number().min(0).max(1);

const policyConfigSchema = z
  .object({
    policyVersion: z.string().min(1),
    globalLtvCap: percentage,
    termCaps: z.record(z.string(), percentage),
    standardTerms: z.array(z.number().int().positive()).min(1),
    spreadBufferMultiplier: z.number().min(0).max(10),
    liquidationCostPct: percentage,
    safetyBufferPct: percentage,
    policyFloorHaircut: z.record(z.string(), percentage),
    policyRoundingUnit: z.number().positive(),
    assetQuality: z.object({
      damagedSealFactor: percentage,
      unverifiedSerialFactor: percentage,
    }),
    liquidityFactor: z.object({
      restrictedBuyback: percentage,
      stoppedBuyback: percentage,
    }),
    interest: z
      .object({
        baseAprPct: z.number().min(0).max(1000),
        termPremiumPctPerDay: z.number().min(0).max(100),
        regimePremiumPct: z.object({
          LOW: z.number(),
          NORMAL: z.number(),
          CAUTIOUS: z.number(),
          HIGH: z.number(),
          STRESS: z.number(),
          CRISIS: z.number(),
        }),
        maxScorePremiumPct: z.number().min(0).max(1000),
        minAprPct: z.number().min(0).max(1000),
        maxAprPct: z.number().min(0).max(1000),
      })
      .refine((i) => i.maxAprPct >= i.minAprPct, { message: "interest.maxAprPct must be >= interest.minAprPct" }),
  })
  .refine((c) => c.globalLtvCap > 0, { message: "globalLtvCap must be > 0" });

export async function GET() {
  const auth = await requireRole(CAN_VIEW_GENERAL_DATA);
  if ("error" in auth) return auth.error;

  const [active, versions] = await Promise.all([getActivePolicyConfig(), listPolicyVersions()]);
  return NextResponse.json({ active, versions });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(CAN_PROPOSE_POLICY);
  if ("error" in auth) return auth.error;

  const parsed = policyConfigSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, { status: 400 });
  }

  const entry = await proposePolicyVersion(parsed.data as PolicyConfig, auth.session.user.email ?? undefined);
  return NextResponse.json({ id: entry.id, version: entry.version, isActive: entry.isActive });
}
