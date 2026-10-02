import { NextResponse } from "next/server";
import { resolveReviewToken } from "@/lib/financials/budgets/reviewLink";
import { reviewProperties } from "@/lib/financials/budgets/reviewOverview";
import { setRentReview } from "@/lib/financials/budgets/rentReviewStore";
import { USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// PUBLIC (signed link). POST { propertyCode, confirmed } — the link's person
// signs off (or withdraws) a property's rent and assumptions.
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
    const by = USERS[link.user as UserId]?.label ?? link.user.toUpperCase();
    await setRentReview(link.year, code, b?.confirmed === false ? null : { by, at: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
