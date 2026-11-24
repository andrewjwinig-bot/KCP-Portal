import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { generateSecret, otpauthUri } from "@/lib/totp";
import { getSecret, setPendingSecret, totpEnabled } from "@/lib/totp-store";
import { verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(req: NextRequest): Promise<string | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  return verifySiteToken(req.cookies.get(SITE_COOKIE)?.value, secret);
}

// POST — begin 2FA enrollment for the signed-in user: mint a secret, store it
// pending (not yet enforced), and return the QR + manual key to register in an
// authenticator app. Enabled only after /api/2fa/verify confirms a code.
export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // Re-pairing over an ENABLED 2FA replaces the secret, so it takes a current
  // code — otherwise a session alone could swap in its own authenticator.
  if (await totpEnabled(user)) {
    let body: { code?: string } = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const current = await getSecret(user);
    if (!current || !verifyTotp(current, String(body.code ?? ""))) {
      return NextResponse.json({ error: "Enter the current 6-digit code from your authenticator app." }, { status: 400 });
    }
  }

  const secret = generateSecret();
  await setPendingSecret(user, secret);
  const uri = otpauthUri(user, secret);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  // Group the manual key in 4s for easier typing into Authy.
  const manualKey = secret.replace(/(.{4})/g, "$1 ").trim();
  return NextResponse.json({ otpauthUri: uri, secret, manualKey, qrDataUrl });
}
