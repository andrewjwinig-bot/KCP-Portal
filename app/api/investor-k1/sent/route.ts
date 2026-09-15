import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS } from "@/lib/users";
import { allK1s } from "@/lib/investors/k1Store";
import { listInvestorLinks, linkOwnerIds } from "@/lib/investors/k1Link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET ?year= — which owners have actually been sent their K-1.
 *
 * Deliberately booleans keyed by owner id and nothing else: no names, no
 * filenames, no property. The tax tracker uses it to stop asking people to tick
 * a box for something the portal already knows, and the tracker already lists
 * the investors, so a completion flag discloses nothing further. Any signed-in
 * user may read it — the documents themselves stay behind canManageK1.
 *
 * "Sent" means a published K-1 for the year AND a live link covering that
 * owner. Publishing only happens through a send, so the document half is
 * implied; the live-link half is what makes a revoked link revert the task to
 * outstanding, which is the safer signal — you revoke because something went
 * to the wrong place.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.SITE_AUTH_SECRET;
  const id = secret ? await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret) : "admin";
  if (!id || !(ALL_USERS as readonly string[]).includes(id)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  const asked = Number(req.nextUrl.searchParams.get("year"));
  const year = Number.isFinite(asked) && asked > 0 ? asked : new Date().getFullYear() - 1;

  const live = new Set<string>();
  for (const l of await listInvestorLinks()) {
    if (!l.revoked) for (const owner of linkOwnerIds(l)) live.add(owner);
  }

  const sent: Record<string, boolean> = {};
  for (const d of await allK1s()) {
    if (d.taxYear === year && d.published && live.has(d.ownerId)) sent[d.ownerId] = true;
  }
  return NextResponse.json({ ok: true, year, sent });
}
