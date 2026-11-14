import { NextRequest, NextResponse } from "next/server";
import { verifyTenantToken, linkSecret } from "@/lib/cam/tenantLink/token";
import { getTenantLink } from "@/lib/cam/tenantLink/store";
import { pinMatches, pinSatisfied, makePinCookie, pinCookieName } from "@/lib/cam/tenantLink/access";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Access-PIN gate for a tenant portal link. GET reports whether a PIN is needed
// (and already satisfied); POST checks the PIN and, on success, sets a signed
// short-lived cookie so the tenant isn't re-prompted every request.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadLink(token: string) {
  const secret = linkSecret();
  if (!secret) return { secret: null as string | null, payload: null, link: null };
  const payload = await verifyTenantToken(token, secret);
  if (!payload) return { secret, payload: null, link: null };
  const link = await getTenantLink(payload.id);
  return { secret, payload, link: link && !link.revoked ? link : null };
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { link } = await loadLink(params.token);
  if (!link) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });
  return NextResponse.json({ pinRequired: !!link.pin, satisfied: pinSatisfied(link, req) });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { secret, link } = await loadLink(params.token);
  if (!secret || !link) return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 401 });

  // Throttle attempts per link + IP so a leaked link can't be brute-forced.
  const ip = getClientIp(req);
  if (!checkRateLimit(`pin:${link.id}:${ip}`, 10)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  if (!link.pin) {
    // No PIN configured — nothing to verify; hand back a satisfied cookie.
    const { value, maxAge } = makePinCookie(secret, link.id);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(pinCookieName(link.id), value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
    return res;
  }

  let body: { pin?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!pin) return NextResponse.json({ error: "Enter your access PIN." }, { status: 400 });
  if (!pinMatches(link, pin)) return NextResponse.json({ error: "That PIN doesn't match. Please try again." }, { status: 401 });

  const { value, maxAge } = makePinCookie(secret, link.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(pinCookieName(link.id), value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
  return res;
}
