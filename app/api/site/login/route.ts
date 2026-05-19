import { NextRequest, NextResponse } from "next/server";
import { SITE_COOKIE, signSiteToken } from "@/lib/site-auth";
import { HISTORY_COOKIE, signHistoryToken } from "@/lib/history-auth";
import { ALL_USERS } from "@/lib/users";

export const runtime = "nodejs";

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

/**
 * Site login. The caller picks which user they are signing in as plus a
 * password:
 *  - admin signs in with the admin password (HISTORY_PASSWORD); doing so
 *    also grants the elevated admin cookie.
 *  - every other user signs in with the shared employee password
 *    (SITE_PASSWORD).
 * The chosen user id is baked into the signed site cookie so the server can
 * trust who is logged in.
 */
export async function POST(req: NextRequest) {
  const employeePassword = process.env.SITE_PASSWORD;
  const siteSecret = process.env.SITE_AUTH_SECRET;
  if (!employeePassword || !siteSecret) {
    return NextResponse.json(
      { error: "Site auth is not configured. Set SITE_PASSWORD and SITE_AUTH_SECRET env vars." },
      { status: 503 },
    );
  }

  let body: { user?: string; password?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const user = String(body?.user ?? "");
  const password = String(body?.password ?? "");

  if (!(ALL_USERS as readonly string[]).includes(user)) {
    return NextResponse.json({ error: "Select a valid user" }, { status: 400 });
  }

  const isAdmin = user === "admin";
  const adminPassword = process.env.HISTORY_PASSWORD;
  const adminSecret = process.env.HISTORY_AUTH_SECRET;
  if (isAdmin && (!adminPassword || !adminSecret)) {
    return NextResponse.json(
      { error: "Admin auth is not configured. Set HISTORY_PASSWORD and HISTORY_AUTH_SECRET env vars." },
      { status: 503 },
    );
  }

  const expected = isAdmin ? adminPassword : employeePassword;
  if (!password || password !== expected) {
    // Generic message — don't leak which field was wrong.
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const site = await signSiteToken(siteSecret, user);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_COOKIE, site.value, { ...COOKIE_OPTS, maxAge: site.maxAge });

  // Signing in as admin also grants the elevated admin cookie.
  if (isAdmin) {
    const hist = await signHistoryToken(adminSecret!);
    res.cookies.set(HISTORY_COOKIE, hist.value, { ...COOKIE_OPTS, maxAge: hist.maxAge });
  }

  return res;
}
