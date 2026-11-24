import { NextRequest, NextResponse } from "next/server";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { disableTotp, getSecret, totpEnabled } from "@/lib/totp-store";
import { verifyTotp } from "@/lib/totp";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { code } — turn off 2FA for the signed-in user (removes their secret).
// Takes a CURRENT code: a session alone (a borrowed laptop, a stolen cookie)
// must not be able to strip the second factor (security audit 11/2026). Lost
// the phone? An admin clears it (/api/2fa/reset).
export async function POST(req: NextRequest) {
  const secret = process.env.SITE_AUTH_SECRET;
  const user = secret ? await verifySiteToken(req.cookies.get(SITE_COOKIE)?.value, secret) : null;
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (await totpEnabled(user)) {
    let body: { code?: string } = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const current = await getSecret(user);
    if (!current || !verifyTotp(current, String(body.code ?? ""))) {
      return NextResponse.json({ error: "Enter the current 6-digit code from your authenticator app." }, { status: 400 });
    }
  }
  await disableTotp(user);
  await logAudit({ event: "2fa.disabled", user, ip: auditIp(req) });
  return NextResponse.json({ ok: true });
}
