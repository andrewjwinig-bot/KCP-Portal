import { NextRequest, NextResponse } from "next/server";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { totpEnabled, twoFactorDisabled } from "@/lib/totp-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — 2FA status for the signed-in user.
export async function GET(req: NextRequest) {
  const secret = process.env.SITE_AUTH_SECRET;
  const user = secret ? await verifySiteToken(req.cookies.get(SITE_COOKIE)?.value, secret) : null;
  if (!user) return NextResponse.json({ user: null, enabled: false, disabled: twoFactorDisabled() });
  return NextResponse.json({ user, enabled: await totpEnabled(user), disabled: twoFactorDisabled() });
}
