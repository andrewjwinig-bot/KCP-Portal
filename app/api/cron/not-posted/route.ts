import { NextResponse } from "next/server";
import { sendNotPostedDigest } from "@/lib/financials/operating-statements/notPostedEmail";
import { cronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily safety net for the "not posted to the GL" digest: an import whose
 * page closed before it asked for the digest leaves its properties staged, and
 * this sends them as one email. Entries staged in the last 30 minutes are left
 * for the page (an import may still be running).
 *
 * GET: Vercel cron (`Authorization: Bearer <CRON_SECRET>`) only (lib/cronAuth.ts).
 * Sits outside the site-auth middleware — see middleware.ts matcher.
 */
async function authorized(req: Request): Promise<boolean> {
  return cronAuthorized(req);
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await sendNotPostedDigest({ olderThanMs: 30 * 60 * 1000 }));
}
