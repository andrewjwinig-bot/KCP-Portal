import { NextRequest, NextResponse } from "next/server";
import { SITE_COOKIE, verifySiteToken, siteAuthConfigured } from "@/lib/site-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/site/status — returns the signed-in user id from the site cookie.
 * When site auth isn't configured (local dev) it reports admin so the portal
 * stays fully usable without a password.
 */
export async function GET(req: NextRequest) {
  if (!siteAuthConfigured()) {
    return NextResponse.json({ user: "admin", configured: false });
  }
  const secret = process.env.SITE_AUTH_SECRET!;
  const token = req.cookies.get(SITE_COOKIE)?.value;
  const user = await verifySiteToken(token, secret);
  return NextResponse.json({ user, configured: true });
}
