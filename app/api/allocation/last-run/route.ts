import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listAllocationRuns, recordAllocationRun } from "@/lib/allocated-invoicer/runStore";
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

// GET — the allocation run log (newest first).
export async function GET() {
  return NextResponse.json({ runs: await listAllocationRuns() });
}

// POST { periodText, periodEndDate, statementMonth } — record an allocation run.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const periodText = String(body?.periodText ?? "").trim();
    const periodEndDate = String(body?.periodEndDate ?? "").trim();
    const statementMonth = String(body?.statementMonth ?? "").trim();
    if (!periodText && !statementMonth) {
      return NextResponse.json({ error: "periodText or statementMonth required" }, { status: 400 });
    }
    const runs = await recordAllocationRun({
      periodText,
      periodEndDate,
      statementMonth,
      ranAt: new Date().toISOString(),
      ranBy: await currentUserLabel(),
    });
    return NextResponse.json({ ok: true, runs });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to record run" }, { status: 500 });
  }
}
