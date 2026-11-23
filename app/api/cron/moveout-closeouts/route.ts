import { NextResponse } from "next/server";
import { runMoveoutWatch } from "@/lib/cam/moveout/watcher";
import { cronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily move-out watcher — the "fire off the final statements when they're
 * ready" job. Scans every departing tenant, parks each in the close-out queue
 * as waiting / ready, and emails a one-time approval request (office → Nancy,
 * retail → Harry, cc the user) the first time one goes ready.
 *
 * GET: invoked by Vercel cron (vercel.json crons array), authed via
 *   `Authorization: Bearer <CRON_SECRET>`. Also runnable manually with the site
 *   cookie (a "Check now" button). `?dry=1` stages without emailing.
 *
 * Sits outside the site-auth middleware so the bearer path works for Vercel
 * cron — see middleware.ts matcher.
 */

async function authorized(req: Request): Promise<boolean> {
  return cronAuthorized(req);
}

async function run(req: Request) {
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const result = await runMoveoutWatch({ notify: !dry });
  return NextResponse.json({ ok: true, dry, ...result });
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run(req);
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run(req);
}
