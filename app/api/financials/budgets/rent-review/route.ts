import { NextResponse } from "next/server";
import { getRentReviews, setRentReview } from "@/lib/financials/budgets/rentReviewStore";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { canEdit } from "@/lib/financials/budgets/contributors";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET ?year= → { reviews: { [propertyCode]: { by, at } } }
export async function GET(req: Request) {
  const year = Number(new URL(req.url).searchParams.get("year"));
  if (!year) return NextResponse.json({ error: "year required" }, { status: 400 });
  return NextResponse.json({ reviews: await getRentReviews(year) });
}

// POST { year, propertyCode, confirmed } — the leasing owner's sign-off. Only
// the property's owner (Harry for a shopping centre, Nancy for a park), Drew or
// admin may confirm, checked here as the leasing decisions are.
export async function POST(req: Request) {
  try {
    const user = await budgetUser();
    if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const b = await req.json();
    const year = Number(b?.year);
    const code = String(b?.propertyCode ?? "").trim().toUpperCase();
    const def = PROPERTY_DEFS.find((d) => d.id.toUpperCase() === code);
    if (!year || !def) return NextResponse.json({ error: "year and a known propertyCode are required" }, { status: 400 });
    if (!canEdit(user, "renewal", def.allocGroup)) {
      return NextResponse.json({ error: "This sign-off belongs to someone else." }, { status: 403 });
    }
    const reviews = await setRentReview(year, code, b?.confirmed === false ? null : { by: USERS[user]?.label ?? user, at: new Date().toISOString() });
    return NextResponse.json({ ok: true, reviews });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
