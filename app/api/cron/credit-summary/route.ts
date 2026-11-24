import { NextResponse } from "next/server";
import { sendCreditSummary } from "@/lib/statements/reminderBatchStore";
import { portalOrigin } from "@/lib/linkOrigin";
import { cronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily: on the business day before the 25th (statements go out on the 25th),
 * email Drew and Tami every credit a tenant asked us to apply from this
 * month's notices, unposted first — so none is missed on the statements
 * (owner, 11/2026). A no-op any other day, and once sent.
 *
 * GET: Vercel cron (`Authorization: Bearer <CRON_SECRET>`) only (lib/cronAuth.ts).
 * Sits outside the site-auth middleware — see middleware.ts matcher.
 */
async function authorized(req: Request): Promise<boolean> {
  return cronAuthorized(req);
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await sendCreditSummary({ origin: portalOrigin() }));
}
