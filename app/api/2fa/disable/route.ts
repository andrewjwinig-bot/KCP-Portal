import { NextRequest, NextResponse } from "next/server";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { disableTotp } from "@/lib/totp-store";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — turn off 2FA for the signed-in user (removes their secret).
export async function POST(req: NextRequest) {
  const secret = process.env.SITE_AUTH_SECRET;
  const user = secret ? await verifySiteToken(req.cookies.get(SITE_COOKIE)?.value, secret) : null;
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  await disableTotp(user);
  await logAudit({ event: "2fa.disabled", user, ip: auditIp(req) });
  return NextResponse.json({ ok: true });
}
