import { NextResponse } from "next/server";
import { resolveReviewToken } from "@/lib/financials/budgets/reviewLink";
import { reviewOverview, REVIEW_GROUP } from "@/lib/financials/budgets/reviewOverview";
import { USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// PUBLIC (signed link, no sign-in). GET → who the link is for, the group and
// year, and every property's calls and sign-off. Only the link's own group.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const { token } = params;
  const link = await resolveReviewToken(token, true);
  if (!link) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  const g = REVIEW_GROUP[link.group];
  return NextResponse.json({
    person: { id: link.user, label: USERS[link.user as UserId]?.label ?? link.user.toUpperCase() },
    group: link.group, title: g.title, year: link.year,
    properties: await reviewOverview(link.group, link.year),
  });
}
