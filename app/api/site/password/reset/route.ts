// An admin issues someone a ONE-TIME password (they forgot theirs, or a new
// hire's first sign-in). Admin-only: middleware gates this path behind the
// admin cookie (`ADMIN_PATH_PREFIXES`). The person signs in with it and must
// choose their own before going anywhere else.
//   GET → every login and where its password comes from
//   POST { userId } → { temp } — shown to the admin once, never stored
import { NextRequest, NextResponse } from "next/server";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { issueTemporaryPassword, listStoredPasswords } from "@/lib/passwordStore";
import { hasEnvPassword } from "@/lib/user-passwords";
import { logAudit, auditIp } from "@/lib/audit";
import { ALL_USERS, USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function admin(req: NextRequest): Promise<string | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  return verifySiteToken(req.cookies.get(SITE_COOKIE)?.value, secret);
}

export async function GET(req: NextRequest) {
  if (!(await admin(req))) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const stored = new Map((await listStoredPasswords()).map((r) => [r.userId, r]));
  const users = ALL_USERS.filter((u) => u !== "admin").map((id) => {
    const r = stored.get(id);
    const source = r ? (r.mustChange ? "one-time" : "own") : hasEnvPassword(id) ? "vercel" : "shared";
    return { id, label: USERS[id as UserId]?.label ?? id, source, updatedAt: r?.updatedAt ?? null };
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const by = await admin(req);
  if (!by) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  if (!(ALL_USERS as readonly string[]).includes(userId) || userId === "admin") {
    return NextResponse.json({ error: "Pick a user." }, { status: 400 });
  }
  const temp = await issueTemporaryPassword(userId, by);
  await logAudit({ event: "password.reset", user: by, ip: auditIp(req), detail: `one-time password issued for ${userId}` });
  return NextResponse.json({ ok: true, temp });
}
