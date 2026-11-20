import { NextResponse } from "next/server";
import { sendCreditSummary } from "@/lib/statements/reminderBatchStore";
import { portalOrigin } from "@/lib/linkOrigin";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily: on the business day before the 25th (statements go out on the 25th),
 * email Drew and Tami every credit a tenant asked us to apply from this
 * month's notices, unposted first — so none is missed on the statements
 * (owner, 11/2026). A no-op any other day, and once sent.
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
  return NextResponse.json(await sendCreditSummary({ origin: portalOrigin() }));
}
