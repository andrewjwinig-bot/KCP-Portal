import { NextResponse, type NextRequest } from "next/server";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { canEditLines } from "@/lib/financials/budgets/contributors";
import { listReviewLinks, mintReviewLink, revokeReviewLink, reviewLinkSecret, signReviewToken } from "@/lib/financials/budgets/reviewLink";
import { REVIEW_GROUP, type ReviewGroup } from "@/lib/financials/budgets/reviewOverview";
import { linkOrigin } from "@/lib/linkOrigin";
import { USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// The Rent Roll Review links — minted and revoked by Drew / admin only, since
// a link opens rent rolls with no sign-in.
//   GET  ?year=            → the live links for the year
//   POST { group, year }   → the live link for that group (its owner), minted if none
//   DELETE { id }          → revoke
async function staff() {
  const u = await budgetUser();
  return u && canEditLines(u) ? u : null;
}

export async function GET(req: NextRequest) {
  if (!(await staff())) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const year = Number(new URL(req.url).searchParams.get("year"));
  const secret = reviewLinkSecret();
  const links = (await listReviewLinks()).filter((l) => !l.revoked && (!year || l.year === year));
  const origin = linkOrigin(req);
  return NextResponse.json({
    links: await Promise.all(links.map(async (l) => ({
      ...l,
      url: secret ? `${origin}/budget-review/${await signReviewToken(secret, { v: 1, id: l.id, u: l.user, g: l.group, y: l.year })}` : null,
    }))),
  });
}

export async function POST(req: NextRequest) {
  const u = await staff();
  if (!u) return NextResponse.json({ error: "Only Drew or admin can create review links." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const group = (b?.group === "BP" ? "BP" : b?.group === "SC" ? "SC" : null) as ReviewGroup | null;
  const year = Number(b?.year);
  if (!group || !year) return NextResponse.json({ error: "group (SC/BP) and year required" }, { status: 400 });
  const minted = await mintReviewLink(REVIEW_GROUP[group].owner, group, year, USERS[u]?.label ?? u);
  if (!minted) return NextResponse.json({ error: "Links need SITE_AUTH_SECRET to be set." }, { status: 500 });
  return NextResponse.json({ link: minted.link, url: `${linkOrigin(req)}/budget-review/${minted.token}` });
}

export async function DELETE(req: Request) {
  if (!(await staff())) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const ok = await revokeReviewLink(String(b?.id ?? ""));
  return NextResponse.json({ ok });
}
