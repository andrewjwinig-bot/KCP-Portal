import { NextResponse } from "next/server";
import { autoSendStagedAllocations } from "@/lib/allocated-invoicer/autoProcess";
import { cronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily safety net for the automatic Allocated Expenses send: anything a 2000
 * G&A GL import staged but did not get to AvidXchange (mail down, a timeout) is
 * sent now, oldest month first. Holds what `autoSendAllocation` holds (a split
 * that doesn't tie; a posting-report figure). Idempotent — a no-op once sent.
 *
 * GET: Vercel cron (`Authorization: Bearer <CRON_SECRET>`) only (lib/cronAuth.ts).
 * Sits outside the site-auth middleware — see middleware.ts matcher.
 */
async function authorized(req: Request): Promise<boolean> {
  return cronAuthorized(req);
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await autoSendStagedAllocations(null);
  return NextResponse.json({ results });
}
