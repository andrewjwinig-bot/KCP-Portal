import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setAccountResolved, getResolvedAccounts } from "@/lib/financials/cash-analysis/resolvedStore";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canSwitchUsers, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

// POST { account, resolved } — mark a GL account resolved (hidden from the
// Unmapped review) or restore it. Admin/Drew only (the page is too).
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !canSwitchUsers(user)) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const account = String(body?.account ?? "").trim();
  if (!account) return NextResponse.json({ error: "account required" }, { status: 400 });
  const accounts = await setAccountResolved(account, body?.resolved !== false);
  return NextResponse.json({ ok: true, accounts });
}

export async function GET() {
  return NextResponse.json({ accounts: await getResolvedAccounts() });
}
