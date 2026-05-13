import { NextRequest, NextResponse } from "next/server";
import { SITE_COOKIE, signSiteToken } from "@/lib/site-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const expectedPassword = process.env.SITE_PASSWORD;
  const secret = process.env.SITE_AUTH_SECRET;
  if (!expectedPassword || !secret) {
    return NextResponse.json(
      { error: "Site auth is not configured. Set SITE_PASSWORD and SITE_AUTH_SECRET env vars." },
      { status: 503 },
    );
  }
  let body: { password?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const provided = String(body?.password ?? "");
  if (provided !== expectedPassword) {
    // Generic message — don't leak which field was wrong.
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  const { value, maxAge } = await signSiteToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
