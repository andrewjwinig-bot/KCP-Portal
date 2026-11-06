import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { recoverState, applyRecover } from "@/lib/allocated-invoicer/recoverHeld";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUserLabel(): Promise<string | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? USERS[id as UserId].label : null;
}

// GET — the held-balance recovery: what it would restore (a dry run), or that it is done.
export async function GET() {
  try {
    return NextResponse.json(await recoverState());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Repair preview failed" }, { status: 500 });
  }
}

// POST — apply it, once.
export async function POST() {
  try {
    const r = await applyRecover(await currentUserLabel());
    if ("error" in r) return NextResponse.json(r, { status: 409 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Repair failed" }, { status: 500 });
  }
}
