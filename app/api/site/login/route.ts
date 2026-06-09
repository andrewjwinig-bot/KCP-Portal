import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { SITE_COOKIE, signSiteToken } from "@/lib/site-auth";
import { HISTORY_COOKIE, signHistoryToken } from "@/lib/history-auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyUserPassword } from "@/lib/user-passwords";
import { logAudit, auditIp } from "@/lib/audit";
import { totpRequired, getSecret, mustEnroll } from "@/lib/totp-store";
import { verifyTotp } from "@/lib/totp";
import { ALL_USERS } from "@/lib/users";

export const runtime = "nodejs";

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
// Brute-force throttle on the shared password: max attempts per IP per hour.
const LOGIN_ATTEMPTS_PER_HOUR = 15;

/** Constant-time, length-independent string equality (HMAC both sides under a
 *  per-call random key, then compare digests) — avoids the timing side-channel
 *  of `!==` on the password. */
function safeEqual(a: string, b: string): boolean {
  const k = randomBytes(32);
  const da = createHmac("sha256", k).update(a).digest();
  const db = createHmac("sha256", k).update(b).digest();
  return timingSafeEqual(da, db);
}

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

  // Throttle brute-force guessing of the shared password (per IP).
  if (!checkRateLimit(`site-login:${getClientIp(req)}`, LOGIN_ATTEMPTS_PER_HOUR)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let body: { user?: string; password?: string; code?: string } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const user = String(body?.user ?? "");
  const password = String(body?.password ?? "");

  if (!(ALL_USERS as readonly string[]).includes(user)) {
    return NextResponse.json({ error: "Select a valid user" }, { status: 400 });
  }

  // admin and drew sign in at the admin tier — elevated cookie.
  const isAdmin = user === "admin" || user === "drew";
  const adminPassword = process.env.HISTORY_PASSWORD;
  const adminSecret = process.env.HISTORY_AUTH_SECRET;

  // Verify against the user's OWN password when configured (proves identity);
  // otherwise fall back to the shared tier password.
  const perUser = verifyUserPassword(user, password);
  let ok: boolean;
  if (perUser !== null) {
    ok = perUser;
  } else {
    if (isAdmin && (!adminPassword || !adminSecret)) {
      return NextResponse.json(
        { error: "Admin auth is not configured. Set HISTORY_PASSWORD and HISTORY_AUTH_SECRET env vars." },
        { status: 503 },
      );
    }
    const expected = isAdmin ? adminPassword : employeePassword;
    ok = !!password && !!expected && safeEqual(password, expected);
  }
  if (!ok) {
    await logAudit({ event: "login.fail", user, ip: auditIp(req), detail: isAdmin ? "admin tier" : "employee tier" });
    // Generic message — don't leak which field was wrong.
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  // The elevated cookie is signed with the admin secret — required for admins
  // even when they authenticated via a per-user password.
  if (isAdmin && !adminSecret) {
    return NextResponse.json(
      { error: "Admin auth is not configured. Set HISTORY_AUTH_SECRET env var." },
      { status: 503 },
    );
  }

  // Second factor (when the user has 2FA enabled). Password is correct at this
  // point; require a valid TOTP code before issuing the session.
  if (await totpRequired(user)) {
    const code = String(body?.code ?? "").trim();
    if (!code) {
      return NextResponse.json({ twoFactorRequired: true }, { status: 401 });
    }
    const secret = await getSecret(user);
    if (!secret || !verifyTotp(secret, code)) {
      await logAudit({ event: "2fa.fail", user, ip: auditIp(req) });
      return NextResponse.json({ twoFactorRequired: true, error: "Incorrect code" }, { status: 401 });
    }
  }

  // A 2FA-required user who hasn't enrolled yet gets an enroll-pending session
  // — valid, but the middleware confines it to the setup page until they
  // finish (guided rollout). Reaching here means they aren't yet enrolled
  // (totpRequired would have challenged a code above otherwise).
  const enrollPending = await mustEnroll(user);

  const site = await signSiteToken(siteSecret, user, enrollPending);
  const res = NextResponse.json({ ok: true, mustEnroll: enrollPending });
  res.cookies.set(SITE_COOKIE, site.value, { ...COOKIE_OPTS, maxAge: site.maxAge });

  // Signing in as admin also grants the elevated admin cookie.
  if (isAdmin) {
    const hist = await signHistoryToken(adminSecret!);
    res.cookies.set(HISTORY_COOKIE, hist.value, { ...COOKIE_OPTS, maxAge: hist.maxAge });
  }

  await logAudit({ event: "login.success", user, ip: auditIp(req), detail: `${isAdmin ? "admin tier" : "employee tier"}${enrollPending ? " · enrollment required" : ""}` });
  return res;
}
