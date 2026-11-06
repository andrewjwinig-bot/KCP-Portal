import { NextResponse } from "next/server";
import { autoSendQuarterly } from "@/lib/cam/retail/quarterlySend";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Daily safety net for the automatic quarterly CAM send (Wawa @ 9510): a
 * quarter whose last month's GL is imported but which did not go (mail down,
 * a timeout) is sent now; one that jumped is held and Drew is told once. The
 * GL import is the primary trigger. Idempotent — a no-op once sent.
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
  const results = await autoSendQuarterly(null, null);
  return NextResponse.json({ results });
}
