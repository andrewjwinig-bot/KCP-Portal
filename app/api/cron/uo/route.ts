import { NextResponse } from "next/server";
import { uoTick } from "@/lib/uo/cycle";
import { cronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily, 9am Eastern: the Philadelphia U&O cycle (lib/uo/cycle.ts) — the
 * delinquent review to Greg and Harry on the 16th, a reminder on the 20th,
 * the month's returns to Drew once confirmed (or the 21st), and an overdue
 * notice after the 25th.
 *
 * GET: Vercel cron (`Authorization: Bearer <CRON_SECRET>`) only (lib/cronAuth.ts).
 * Sits outside the site-auth middleware — see middleware.ts matcher.
 */
async function authorized(req: Request): Promise<boolean> {
  return cronAuthorized(req);
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await uoTick());
}
