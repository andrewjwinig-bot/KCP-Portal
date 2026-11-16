import { NextResponse } from "next/server";
import { autoSendTick } from "@/lib/statements/reminderBatchStore";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily, 8:45am Eastern: if Greg has not sent the month's tenant notices, he
 * is reminded one business day after they were built, and every ticked notice
 * goes on its own after two (owner: "if greg doesnt approve or forgets it will
 * send automatically"). Unticked tenants stay held. Also finishes a send that
 * ran out of time.
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
  return NextResponse.json(await autoSendTick());
}
