import { NextResponse } from "next/server";
import { priorQuarterLabel, sendQuarterToAvidBill } from "@/lib/commissions/sendQuarterToAvidBill";
import { runQuarterEnd } from "@/lib/commissions/quarterReview";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { authorizeRequest, USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Quarter-end commissions → kormancommercial@avidbill.com, one PDF per
 * commission, each its OWN email. No approval step.
 *
 * GET form: Vercel cron EVERY MORNING (vercel.json) for the most recently
 *   completed quarter — sends whatever is not yet at Avid, then the memo + GL
 *   import to Marie and the memo to Alison for her records.
 *
 * POST form: the page's "Send to AvidXchange" button. Body shape
 *   { quarterLabel?: string, dryRun?: boolean, force?: boolean }
 *   Does the same for that quarter now (dryRun previews it). `force` is the
 *   old direct re-send of a quarter sent the old way.
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
  // Every invoice not yet at Avid goes — no approval step — then Marie's memo
  // + GL import and Alison's memo for her records (see quarterReview.ts).
  return NextResponse.json(await runQuarterEnd(priorQuarterLabel()));
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { quarterLabel?: string; dryRun?: boolean; force?: boolean; kind?: "office" | "retail" } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const quarterLabel = body.quarterLabel ?? priorQuarterLabel();
  const by = await senderLabel(req);
  // Each page sends its own: office (Nancy's) or retail (Harry's).
  const kind = body.kind === "office" || body.kind === "retail" ? body.kind : undefined;
  // `force`: re-send a quarter that went out the OLD way, after checking with
  // AP — a person's call, kept as it was.
  if (body.force) {
    return NextResponse.json(await sendQuarterToAvidBill({ quarterLabel, dryRun: !!body.dryRun, force: true, by, kind }));
  }
  // The preview: what WILL go (the invoices not yet at Avid).
  if (body.dryRun) return NextResponse.json(await sendQuarterToAvidBill({ quarterLabel, dryRun: true, by, kind }));
  // What goes now, for the result line.
  const preview = await sendQuarterToAvidBill({ quarterLabel, dryRun: true, by, kind });
  const res = await runQuarterEnd(quarterLabel, by, kind);
  if (!("memos" in res)) return NextResponse.json({ ok: true, quarterLabel, count: 0, total: 0, alreadySent: true });
  if (res.avidBill && !res.avidBill.ok) return NextResponse.json({ ...res.avidBill, memos: res.memos });
  const failed = Object.values(res.retailSends ?? {}).filter((r) => !(r as { avid?: boolean }).avid).length;
  return NextResponse.json({
    ok: failed === 0, quarterLabel, count: preview.count, total: preview.total, memos: res.memos,
    ...(failed ? { reason: `${failed} retail invoice${failed === 1 ? "" : "s"} did not reach AvidXchange — send again to finish` } : {}),
  });
}
