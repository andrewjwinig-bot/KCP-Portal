import { NextResponse } from "next/server";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { taskOccurrencesBetween } from "@/lib/tracker/taskDefs";
import { getCompletions } from "@/lib/tracker/completionStore";
import { getImportEvents, type ImportEvent } from "@/lib/tracker/importEvents";
import { outstandingGlUploads, type OutstandingGl } from "@/lib/financials/operating-statements/outstanding";
import { recentlyVacatedTenants, type VacatedTenant } from "@/lib/leasing/recentlyVacated";
import { collectNotPosted, significantNotPosted, type NotPostedItem } from "@/lib/financials/operating-statements/notPosted";
import { buildDigest, weekBounds } from "@/lib/tracker/weeklyDigest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Weekly task digest — emailed Monday morning so Drew sees the week's
 * tracker tasks + the files that need importing without having to open
 * the portal. Requested because tasks were slipping unseen.
 *
 * GET form: invoked by Vercel cron (vercel.json crons array), authed via
 *   `Authorization: Bearer <CRON_SECRET>`. Also usable manually with the
 *   site cookie (e.g. a "Send me this week" button) or `?to=` override.
 *
 * Recipient is fixed server-side (dwinig@kormancommercial.com) so this
 * can't be used as an open relay; `?to=` only narrows to a verified
 * override in dev.
 *
 * Sits outside the site-auth middleware so the bearer path works for
 * Vercel cron — see middleware.ts matcher.
 */

const DIGEST_TO = "dwinig@kormancommercial.com";
const DIGEST_FROM = "dwinig@kormancommercial.com"; // verified Postmark sender

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
      const userId = await verifySiteToken(token, siteSecret);
      if (userId) return true;
    }
  }
  if (!secret && !siteSecret) return process.env.NODE_ENV !== "production";
  return false;
}

/** Monday 00:00 → Sunday 23:59:59 of the week containing `now`. */
async function runDigest(req: Request) {
  const now = new Date();
  const { start, end } = weekBounds(now);
  const tasks = taskOccurrencesBetween(start, end).filter((t) => t.owner === "drew");

  let completions: Record<string, unknown> = {};
  try { completions = await getCompletions(); } catch { /* best-effort */ }

  let outstanding: { expected: { year: number; period: number }; behind: OutstandingGl[] } | null = null;
  try { outstanding = await outstandingGlUploads(now); } catch { /* best-effort */ }

  let vacated: VacatedTenant[] = [];
  try { vacated = await recentlyVacatedTenants(now); } catch { /* best-effort */ }

  let importEvents: Record<string, ImportEvent> = {};
  try { importEvents = await getImportEvents(); } catch { /* best-effort */ }

  let notPosted: NotPostedItem[] = [];
  // Only the big, easy-to-miss postings (management fees, insurance, taxes,
  // debt) — not routine monthly CAM lines briefly reading $0.
  try { notPosted = significantNotPosted((await collectNotPosted(now.getFullYear())).items); } catch { /* best-effort */ }

  const { subject, textBody, htmlBody, open, doneCount, imports, behind } = buildDigest(now, tasks, completions, outstanding, vacated, importEvents, notPosted);

  const url = new URL(req.url);
  const toOverride = url.searchParams.get("to");
  const to = toOverride && process.env.NODE_ENV !== "production" ? toOverride : DIGEST_TO;

  if (!isMailConfigured()) {
    // Return the digest so a dev/manual call can still preview it.
    return NextResponse.json({ sent: false, reason: "mail-not-configured", subject, textBody, htmlBody });
  }

  // Clean links: no Postmark click-tracking wrapper on every portal URL.
  const ok = await sendMail({ to, from: DIGEST_FROM, subject, textBody, htmlBody, noLinkTracking: true });
  return NextResponse.json({
    sent: ok,
    to,
    open: open.length,
    done: doneCount,
    imports: imports.length,
    outstandingGl: behind.length,
    toCloseOut: vacated.length,
  });
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return runDigest(req);
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return runDigest(req);
}
