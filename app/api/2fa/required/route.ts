import { NextRequest, NextResponse } from "next/server";
import { getRequiredUsers, setRequiredUsers } from "@/lib/totp-store";
import { ALL_USERS, USERS } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only (gated by ADMIN_PATH_PREFIXES in middleware). Manage which users
// must set up 2FA — a required user is funneled into guided setup at login.

export async function GET() {
  const required = await getRequiredUsers();
  const users = ALL_USERS.map((id) => ({ id, label: USERS[id].label, required: required.includes(id) }));
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  let body: { users?: string[] } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const ids = Array.isArray(body.users) ? body.users.filter((u) => (ALL_USERS as readonly string[]).includes(u)) : [];
  await setRequiredUsers(ids);
  return NextResponse.json({ ok: true, users: await getRequiredUsers() });
}
