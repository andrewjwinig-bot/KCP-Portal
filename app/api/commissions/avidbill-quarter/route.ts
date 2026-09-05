import { NextResponse } from "next/server";
import { priorQuarterLabel, sendQuarterToAvidBill } from "@/lib/commissions/sendQuarterToAvidBill";
import { sendQuarterMemoToKorman } from "@/lib/commissions/sendQuarterMemo";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quarter-end send to kormancommercial@avidbill.com — one PDF per
 * logged commission, attached to a single email.
 *
 * GET form: invoked by Vercel cron (vercel.json crons array). Auth
 *   via `Authorization: Bearer <CRON_SECRET>` header that Vercel
 *   sets on scheduled invocations.
 *
 * POST form: manual / dev triggers. Body shape
 *   { quarterLabel?: string, dryRun?: boolean, force?: boolean }
 *   Defaults: most-recently-completed quarter, dryRun = false,
 *   force = false.
 *
 * Auth gate accepts either:
 *  - `Authorization: Bearer <CRON_SECRET>` (Vercel cron), OR
 *  - a valid signed-in site cookie (the "Send to AvidBill" button on
 *    the /commissions page, which only the CAN_UPLOAD users can see)
 *
 * Sits outside the site-auth middleware so the bearer path works for
 * Vercel cron — see middleware.ts matcher.
 *
 * The endpoint stays idempotent — re-runs for an already-sent
 * quarter return the prior result unless `force: true`.
 */

async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (secret && header === `Bearer ${secret}`) return true;

  // Fall back to the site cookie so the manual "Send to AvidBill"
  // button on /commissions can hit the endpoint without staff having
  // to paste a bearer token in the browser.
  const siteSecret = process.env.SITE_AUTH_SECRET;
  if (siteSecret) {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const match = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${SITE_COOKIE}=`));
    if (match) {
      const token = decodeURIComponent(match.slice(SITE_COOKIE.length + 1));
      const userId = await verifySiteToken(token, siteSecret);
      if (userId) return true;
    }
  }
  // No bearer + no site auth configured = dev sandbox, permit.
  if (!secret && !siteSecret) return process.env.NODE_ENV !== "production";
  return false;
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const quarterLabel = priorQuarterLabel();
  // Both quarter-end sends: per-commission invoices → AvidBill, and the memo
  // top-sheet + GL import files → the office (mjaster@). The memo send is
  // best-effort so an AvidBill success is still reported if it fails.
  const avidBill = await sendQuarterToAvidBill({ quarterLabel });
  const kormanMemo = await sendQuarterMemoToKorman({ quarterLabel }).catch((e) => ({ ok: false, quarterLabel, funds: [], attachments: 0, reason: e instanceof Error ? e.message : "error" }));
  return NextResponse.json({ avidBill, kormanMemo });
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { quarterLabel?: string; dryRun?: boolean; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const quarterLabel = body.quarterLabel ?? priorQuarterLabel();
  const avidBill = await sendQuarterToAvidBill({ quarterLabel, dryRun: !!body.dryRun, force: !!body.force });
  const kormanMemo = await sendQuarterMemoToKorman({ quarterLabel, dryRun: !!body.dryRun, force: !!body.force })
    .catch((e) => ({ ok: false, quarterLabel, funds: [], attachments: 0, reason: e instanceof Error ? e.message : "error" }));
  return NextResponse.json({ avidBill, kormanMemo });
}
