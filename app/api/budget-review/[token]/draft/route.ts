import { NextResponse } from "next/server";
import { resolveReviewToken } from "@/lib/financials/budgets/reviewLink";
import { reviewProperties } from "@/lib/financials/budgets/reviewOverview";
import { buildBudgetDraft } from "@/lib/financials/budgets/draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// PUBLIC (signed link). GET ?key= → what the leasing decisions need for one
// property — its rent and recoveries by suite and the leasing calls — and
// NOTHING else of the budget (no expense lines, no NOI, no debt): the link is
// for making the calls, not for reading the budget. Refused for any property
// outside the link's group.
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const { token } = params;
  const link = await resolveReviewToken(token);
  if (!link) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!(await reviewProperties(link.group)).some((p) => p.key === key)) {
    return NextResponse.json({ error: "Not part of this review." }, { status: 403 });
  }
  const draft = await buildBudgetDraft(key, link.year, 3);
  if (!draft) return NextResponse.json({ missingBasis: true });
  return NextResponse.json({
    propertyCode: draft.propertyCode,
    propertyName: draft.propertyName,
    budgetYear: draft.budgetYear,
    leasing: draft.leasing,
    tenantRevenue: draft.tenantRevenue,
    reimbursementEstimate: draft.reimbursementEstimate,
    recoveryTie: draft.recoveryTie,
    rentLineLabel: draft.rentLineLabel,
    canEditLines: false,
  });
}
