import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canManageK1, type UserId } from "@/lib/users";
import { PREVIEW_TOKEN } from "@/lib/investors/k1Preview";
import { verifyInvestorToken, investorLinkSecret, getInvestorLink } from "@/lib/investors/k1Link";
import { investorPinCookieName, investorPinMatches, makeInvestorPinCookie } from "@/lib/investors/k1Access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — does this link need a PIN, and is one already satisfied? */

/** Preview is STAFF only, checked before any token logic — it must never become
 *  a way to reach a real investor's documents. */
async function previewViewer(): Promise<boolean> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return false;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return !!id && (ALL_USERS as readonly string[]).includes(id) && canManageK1(id as UserId);
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const t = (await params).token;
  if (t === PREVIEW_TOKEN) {
    if (!(await previewViewer())) return NextResponse.json({ error: "Preview is for staff only." }, { status: 401 });
    return NextResponse.json({ ok: true, satisfied: true });
  }
  const secret = investorLinkSecret();
  const payload = secret ? await verifyInvestorToken(params.token, secret) : null;
  if (!payload) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });
  const link = await getInvestorLink(payload.id);
  if (!link || link.revoked) return NextResponse.json({ error: "This link has been revoked." }, { status: 401 });
  const { verifyPinCookie } = await import("@/lib/cam/tenantLink/pin");
  return NextResponse.json({
    // Always true for investor links; kept in the response so the portal shell
    // reads the same shape as the tenant one.
    pinRequired: true,
    satisfied: verifyPinCookie(req.cookies.get(investorPinCookieName(link.id))?.value, secret!, link.id),
  });
}

/** POST { pin } — exchange the PIN for a short-lived signed cookie. */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const secret = investorLinkSecret();
  const payload = secret ? await verifyInvestorToken(params.token, secret) : null;
  if (!payload) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });
  const link = await getInvestorLink(payload.id);
  if (!link || link.revoked) return NextResponse.json({ error: "This link has been revoked." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!investorPinMatches(link.pin, String(body?.pin ?? ""))) {
    return NextResponse.json({ error: "That PIN doesn't match." }, { status: 401 });
  }
  const cookie = makeInvestorPinCookie(secret!, link.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(investorPinCookieName(link.id), cookie.value, {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: cookie.maxAge,
  });
  return res;
}
