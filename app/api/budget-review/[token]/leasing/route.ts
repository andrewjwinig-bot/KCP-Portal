import { NextResponse } from "next/server";
import { resolveReviewToken } from "@/lib/financials/budgets/reviewLink";
import { reviewProperties } from "@/lib/financials/budgets/reviewOverview";
import { setLeasingAssumption, leasingDecisionFromBody } from "@/lib/financials/budgets/leasingAssumptions";
import { USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// PUBLIC (signed link). POST { propertyCode, unitRef, kind, … } — a leasing
// decision, through the SAME cleaning the budget page's route uses, stamped
// with the link's person. Refused for a property outside the link's group.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const { token } = params;
  const link = await resolveReviewToken(token);
  if (!link) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  try {
    const b = await req.json();
    const code = String(b?.propertyCode ?? "").trim().toUpperCase();
    if (!(await reviewProperties(link.group)).some((p) => p.code === code)) {
      return NextResponse.json({ error: "Not part of this review." }, { status: 403 });
    }
    const parsed = leasingDecisionFromBody(b, USERS[link.user as UserId]?.label ?? link.user.toUpperCase());
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    await setLeasingAssumption(link.year, code, parsed.decision);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
