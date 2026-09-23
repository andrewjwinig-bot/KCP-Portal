import { NextResponse } from "next/server";
import { resolveReviewToken } from "@/lib/financials/budgets/reviewLink";
import { reviewProperties } from "@/lib/financials/budgets/reviewOverview";
import { buildBudgetDraft } from "@/lib/financials/budgets/draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// PUBLIC (signed link). GET ?key= → one property's budget draft — refused for
// any property outside the link's group. Read-only: the grid's typed months
// stay a signed-in job (canEditLines is always false here).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveReviewToken(token);
  if (!link) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!(await reviewProperties(link.group)).some((p) => p.key === key)) {
    return NextResponse.json({ error: "Not part of this review." }, { status: 403 });
  }
  const draft = await buildBudgetDraft(key, link.year, 3);
  if (!draft) return NextResponse.json({ missingBasis: true });
  return NextResponse.json({ ...draft, canEditLines: false });
}
