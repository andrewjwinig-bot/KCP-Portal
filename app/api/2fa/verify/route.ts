import { NextRequest, NextResponse } from "next/server";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { verifyTotp } from "@/lib/totp";
import { getSecret, enableTotp } from "@/lib/totp-store";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(req: NextRequest): Promise<string | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  return verifySiteToken(req.cookies.get(SITE_COOKIE)?.value, secret);
}

// POST { code } — confirm enrollment: verify a code against the pending secret
// and enable 2FA for the signed-in user.
export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { code?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const secret = await getSecret(user);
  if (!secret) return NextResponse.json({ error: "Start enrollment first" }, { status: 400 });
  if (!verifyTotp(secret, String(body.code ?? ""))) {
    return NextResponse.json({ error: "That code didn't match — check the app and try again." }, { status: 400 });
  }
  await enableTotp(user);
  await logAudit({ event: "2fa.enabled", user, ip: auditIp(req) });
  return NextResponse.json({ ok: true });
}
