import { NextResponse } from "next/server";
import { uoTick } from "@/lib/uo/cycle";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily, 9am Eastern: the Philadelphia U&O cycle (lib/uo/cycle.ts) — the
 * delinquent review to Greg and Harry on the 16th, a reminder on the 20th,
 * the month's returns to Drew once confirmed (or the 21st), and an overdue
 * notice after the 25th.
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
  return NextResponse.json(await uoTick());
}
