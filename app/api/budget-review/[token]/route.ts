import { NextResponse } from "next/server";
import { resolveReviewToken } from "@/lib/financials/budgets/reviewLink";
import { reviewOverview, REVIEW_GROUP, linkGroups } from "@/lib/financials/budgets/reviewOverview";
import { isReviewGroup } from "@/lib/financials/budgets/reviewGroups";
import { USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// PUBLIC (signed link, no sign-in). GET [?group=] → who the link is for, the
// group and year, every property's calls and sign-off, and the link's other
// groups as tabs (Harry: Shopping Centers + Korman Homes). Only its own groups.
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const { token } = params;
  const link = await resolveReviewToken(token, true);
  if (!link) return NextResponse.json({ error: "This link is no longer valid." }, { status: 404 });
  const groups = linkGroups(link);
  const asked = new URL(req.url).searchParams.get("group");
  const group = isReviewGroup(asked) && groups.includes(asked) ? asked : groups[0];
  const g = REVIEW_GROUP[group];
  return NextResponse.json({
    person: { id: link.user, label: USERS[link.user as UserId]?.label ?? link.user.toUpperCase() },
    group, title: g.title, year: link.year,
    groups: groups.map((id) => ({ id, title: REVIEW_GROUP[id].tab })),
    properties: await reviewOverview(group, link.year),
  });
}
