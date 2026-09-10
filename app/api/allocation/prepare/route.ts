import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPendingGl } from "@/lib/allocated-invoicer/pendingGlStore";
import { prepareAllocation } from "@/lib/allocated-invoicer/autoProcess";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUserLabel(): Promise<string | undefined> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return undefined;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? USERS[id as UserId].label : undefined;
}

// POST — (re)prepare the allocation from the 2000 G&A GL handed off by the
// Operating Statements import, staging a pending send for review. Idempotent:
// re-preparing a month that's already staged just refreshes it; an already-sent
// or already-finalized month is left as-is. The invoicer calls this on load so
// the imported GL is always reviewable here, even if the import-time prepare
// didn't run.
export async function POST() {
  const g = await getPendingGl();
  if (!g?.fileBase64) {
    return NextResponse.json({ ok: false, reason: "no-pending-gl" }, { status: 404 });
  }
  const buf = Buffer.from(g.fileBase64, "base64");
  const by = await currentUserLabel();
  const result = await prepareAllocation(buf, by ?? null);
  return NextResponse.json(result);
}
