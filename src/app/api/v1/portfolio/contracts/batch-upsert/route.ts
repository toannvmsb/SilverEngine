import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/apiAuth";
import { CAN_ENTER_MARKET_DATA } from "@/lib/roles";

// Section 10.3 Portfolio API — POST /v1/portfolio/contracts/batch-upsert
// Stand-in for Pawn Core CDC/sync until that integration exists (Phase 2).
const contractSchema = z.object({
  contract_id: z.string(),
  branch_id: z.string(),
  customer_segment: z.string().optional(),
  asset_id: z.string(),
  weight_gram: z.coerce.number().positive(),
  purity: z.coerce.number().min(0).max(1).default(0.999),
  principal: z.coerce.number().positive(),
  original_ltv: z.coerce.number().min(0).max(1),
  term_days: z.coerce.number().int().positive(),
  originated_at: z.coerce.date(),
  matures_at: z.coerce.date(),
  status: z.enum(["ACTIVE", "EXTENDED", "REDEEMED", "LIQUIDATED", "DEFAULT"]).default("ACTIVE"),
  interest_rate_apr: z.coerce.number().min(0),
});

const batchSchema = z.object({ contracts: z.array(contractSchema).min(1).max(500) });

export async function POST(req: NextRequest) {
  const auth = await requireRole(CAN_ENTER_MARKET_DATA);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", issues: parsed.error.issues }, { status: 400 });
  }

  const results = await Promise.all(
    parsed.data.contracts.map((c) =>
      prisma.portfolioContract.upsert({
        where: { contractId: c.contract_id },
        create: {
          contractId: c.contract_id,
          branchId: c.branch_id,
          customerSegment: c.customer_segment,
          assetId: c.asset_id,
          weightGram: c.weight_gram,
          purity: c.purity,
          principal: c.principal,
          originalLtv: c.original_ltv,
          termDays: c.term_days,
          originatedAt: c.originated_at,
          maturesAt: c.matures_at,
          status: c.status,
          interestRateApr: c.interest_rate_apr,
        },
        update: {
          branchId: c.branch_id,
          customerSegment: c.customer_segment,
          weightGram: c.weight_gram,
          purity: c.purity,
          principal: c.principal,
          originalLtv: c.original_ltv,
          termDays: c.term_days,
          maturesAt: c.matures_at,
          status: c.status,
          interestRateApr: c.interest_rate_apr,
        },
      })
    )
  );

  return NextResponse.json({ upserted: results.length });
}
