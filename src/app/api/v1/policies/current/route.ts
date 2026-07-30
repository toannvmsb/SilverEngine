import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Section 10.1 Daily policy API
// GET /v1/policies/current?product=PHU_QUY_SILVER_999&branch_id=HN01
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const product = searchParams.get("product") ?? "PHU_QUY_SILVER_999";
  const branchId = searchParams.get("branch_id") ?? "HN01";

  const snapshot = await prisma.policySnapshot.findFirst({
    where: { productCode: product, branchId },
    orderBy: { asOf: "desc" },
  });

  if (!snapshot) {
    return NextResponse.json(
      { error: "NO_POLICY_AVAILABLE", message: "Chưa có dữ liệu thị trường để tính chính sách." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    as_of: snapshot.asOf.toISOString(),
    risk_score: snapshot.riskScore,
    regime: snapshot.regime,
    data_quality_score: snapshot.dataQualityScore,
    reference_price_per_gram_vnd: snapshot.referencePricePerGram,
    terms: JSON.parse(snapshot.terms).map((t: { days: number; ltvCap: number; status: string }) => ({
      days: t.days,
      ltv_cap: t.ltvCap,
      status: t.status,
      max_loan_per_gram_vnd: Math.round(snapshot.referencePricePerGram * t.ltvCap),
    })),
    reason_codes: JSON.parse(snapshot.reasonCodes),
    policy_version: snapshot.policyVersion,
    model_version: snapshot.modelVersion,
  });
}
