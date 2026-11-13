import { NextResponse } from "next/server";
import { autoSendStagedAllocations } from "@/lib/allocated-invoicer/autoProcess";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily safety net for the automatic Allocated Expenses send: anything a 2000
 * G&A GL import staged but did not get to AvidXchange (mail down, a timeout) is
 * sent now, oldest month first. Holds what `autoSendAllocation` holds (a split
 * that doesn't tie; a posting-report figure). Idempotent — a no-op once sent.
 *
 * GET: Vercel cron (`Authorization: Bearer <CRON_SECRET>`) or a signed-in user.
 * Sits outside the site-auth middleware — see middleware.ts matcher.
 */
async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (secret && header === `Bearer ${secret}`) return true;
  const siteSecret = process.env.SITE_AUTH_SECRET;
  if (siteSecret) {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${SITE_COOKIE}=`));
    if (match) {
      const token = decodeURIComponent(match.slice(SITE_COOKIE.length + 1));
      if (await verifySiteToken(token, siteSecret)) return true;
    }
  }
  if (!secret && !siteSecret) return process.env.NODE_ENV !== "production";
  return false;
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await autoSendStagedAllocations(null);
  return NextResponse.json({ results });
}
