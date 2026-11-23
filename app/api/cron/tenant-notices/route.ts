import { NextResponse } from "next/server";
import { autoSendTick } from "@/lib/statements/reminderBatchStore";
import { cronAuthorized } from "@/lib/cronAuth";

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
 * GET: Vercel cron (`Authorization: Bearer <CRON_SECRET>`) only (lib/cronAuth.ts).
 * Sits outside the site-auth middleware — see middleware.ts matcher.
 */
async function authorized(req: Request): Promise<boolean> {
  return cronAuthorized(req);
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await autoSendTick());
}
