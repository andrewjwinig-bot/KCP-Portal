// Change your OWN password (owner, 11/2026: "let users select and change their
// own passwords"). Self-service for every signed-in user, including a session
// confined by a one-time password (middleware lets this path through).
//   GET  → where the caller's password comes from and whether they must change it
//   POST { current, next } → set it; the current one must be right
import { NextRequest, NextResponse } from "next/server";
import { SITE_COOKIE, signSiteToken, verifySiteTokenFull } from "@/lib/site-auth";
import { checkPassword, getStoredPassword, isASharedPassword, setPassword } from "@/lib/passwordStore";
import { passwordProblem } from "@/lib/passwordPolicy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAudit, auditIp } from "@/lib/audit";
import { USERS, type UserId } from "@/lib/users";
import { hasEnvPassword } from "@/lib/user-passwords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_OPTS = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
const isAdminTier = (u: string) => u === "admin" || u === "drew";

async function session(req: NextRequest) {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  return verifySiteTokenFull(req.cookies.get(SITE_COOKIE)?.value, secret);
}

export async function GET(req: NextRequest) {
  const s = await session(req);
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const stored = await getStoredPassword(s.userId).catch(() => null);
  const source = stored ? "portal" : hasEnvPassword(s.userId) ? "vercel" : "shared";
  return NextResponse.json({
    source,
    mustChange: s.passwordPending || !!stored?.mustChange,
    updatedAt: stored?.updatedAt ?? null,
  });
}

export async function POST(req: NextRequest) {
  const s = await session(req);
  if (!s) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const user = s.userId;
  if (!checkRateLimit(`pw-change:${user}:${getClientIp(req)}`, 10)) {
    return NextResponse.json({ error: "Too many tries. Wait an hour and try again." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const current = String(body.current ?? "");
  const next = String(body.next ?? "");

  let check;
  try {
    check = await checkPassword(user, current, { adminTier: isAdminTier(user) });
  } catch {
    return NextResponse.json({ error: "Couldn't check your password right now — try again." }, { status: 503 });
  }
  if (!check.ok) {
    await logAudit({ event: "password.change-fail", user, ip: auditIp(req), detail: "current password wrong" });
    return NextResponse.json({ error: "Your current password isn't right." }, { status: 400 });
  }
  const problem = passwordProblem(next, { userId: user, label: USERS[user as UserId]?.label, current });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (isASharedPassword(next)) {
    return NextResponse.json({ error: "That's a shared password — choose one only you know." }, { status: 400 });
  }

  await setPassword(user, next, { by: user });
  await logAudit({ event: "password.changed", user, ip: auditIp(req), detail: `was ${check.source}${check.mustChange ? " (one-time)" : ""}` });

  // Lift the one-time-password confinement; keep any 2FA setup still owed.
  const res = NextResponse.json({ ok: true });
  const secret = process.env.SITE_AUTH_SECRET;
  if (secret) {
    const site = await signSiteToken(secret, user, s.enrollPending, false);
    res.cookies.set(SITE_COOKIE, site.value, { ...COOKIE_OPTS, maxAge: site.maxAge });
  }
  return res;
}
