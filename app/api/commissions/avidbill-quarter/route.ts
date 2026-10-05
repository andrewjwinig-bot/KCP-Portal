import { NextResponse } from "next/server";
import { priorQuarterLabel, sendQuarterToAvidBill } from "@/lib/commissions/sendQuarterToAvidBill";
import { quarterReview, requestQuarterReview, reviewerEmail, runQuarterEnd } from "@/lib/commissions/quarterReview";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { authorizeRequest, USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quarter-end commissions: Alison reviews, then they go to
 * kormancommercial@avidbill.com — one PDF per commission, each its OWN email.
 *
 * GET form: Vercel cron EVERY MORNING (vercel.json) for the most recently
 *   completed quarter. Emails Alison any invoice awaiting her review (with a
 *   signed link to send them), and finishes sending whatever she approved.
 *   Nothing unapproved goes to Avid. Auth via `Authorization: Bearer
 *   <CRON_SECRET>` header that Vercel sets on scheduled invocations.
 *
 * POST form: the page's "Send for Review" button. Body shape
 *   { quarterLabel?: string, dryRun?: boolean, force?: boolean }
 *   Emails Alison the quarter now (dryRun previews it). `force` is the old
 *   direct re-send of a quarter sent the old way.
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
      // A signed-in user must ALSO be allowed the commissions API — the route
      // sits outside middleware (for the cron), so it has to apply the
      // per-user check itself, or anyone could send a quarter to Avid.
      if (userId && authorizeRequest(userId as UserId, "/api/commissions")) return true;
    }
  }
  // No bearer + no site auth configured = dev sandbox, permit.
  if (!secret && !siteSecret) return process.env.NODE_ENV !== "production";
  return false;
}

async function senderLabel(req: Request): Promise<string | null> {
  const siteSecret = process.env.SITE_AUTH_SECRET;
  const match = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith(`${SITE_COOKIE}=`));
  if (!siteSecret || !match) return null;
  const id = await verifySiteToken(decodeURIComponent(match.slice(SITE_COOKIE.length + 1)), siteSecret);
  return id ? (USERS as Record<string, { label?: string }>)[id]?.label ?? id : null;
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Nothing goes to Avid without Alison's approval: this finishes any approved
  // send, then emails her whatever is newly awaiting review. Marie's memo + GL
  // import follows the approval (see quarterReview.ts).
  return NextResponse.json(await runQuarterEnd(priorQuarterLabel()));
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { quarterLabel?: string; dryRun?: boolean; force?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const quarterLabel = body.quarterLabel ?? priorQuarterLabel();
  // `force`: re-send a quarter that went out the OLD way, after checking with
  // AP — a person's call, kept as it was.
  if (body.force) {
    const avidBill = await sendQuarterToAvidBill({ quarterLabel, dryRun: !!body.dryRun, force: true, by: await senderLabel(req) });
    return NextResponse.json(avidBill);
  }
  // The page's button sends the quarter to ALISON for review — early, or
  // again as a reminder. It never sends to Avid itself.
  const review = await quarterReview(quarterLabel);
  const awaiting = review.invoices.filter((i) => i.status === "awaiting");
  const total = awaiting.reduce((s, i) => s + i.amount, 0);
  if (review.legacy) return NextResponse.json({ ok: true, quarterLabel, count: 0, total: 0, alreadySent: true });
  if (body.dryRun || awaiting.length === 0) {
    return NextResponse.json({
      ok: true, quarterLabel, count: awaiting.length, total, dryRun: true, reviewer: reviewerEmail(),
      ...(awaiting.length === 0 ? { reason: review.invoices.length ? "every invoice is already approved or sent" : "no commissions logged for that quarter" } : {}),
    });
  }
  const res = await requestQuarterReview(quarterLabel, { force: true });
  return NextResponse.json({ ok: res.ok, quarterLabel, count: res.emailed, total, reviewer: reviewerEmail(), reason: res.reason });
}
