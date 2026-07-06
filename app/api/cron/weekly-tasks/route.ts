import { NextResponse } from "next/server";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { taskOccurrencesBetween, CATEGORIES, type TaskOccurrence } from "@/lib/tracker/taskDefs";
import { getCompletions, completionKey } from "@/lib/tracker/completionStore";
import { importsForWeek } from "@/lib/tracker/imports";
import { outstandingGlUploads, type OutstandingGl } from "@/lib/financials/operating-statements/outstanding";
import { recentlyVacatedTenants, type VacatedTenant } from "@/lib/leasing/recentlyVacated";

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
function weekBounds(now: Date): { start: Date; end: Date } {
  const sinceMon = (now.getDay() + 6) % 7; // 0=Sun → week starts Monday
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMon);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59);
  return { start, end };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function buildDigest(
  now: Date,
  tasks: TaskOccurrence[],
  completions: Record<string, unknown>,
  outstanding: { expected: { year: number; period: number }; behind: OutstandingGl[] } | null,
  vacated: VacatedTenant[],
) {
  const { start, end } = weekBounds(now);

  const open = tasks.filter(
    (o) => !completions[completionKey(o.date.getFullYear(), o.date.getMonth(), o.id)],
  );
  const doneCount = tasks.length - open.length;

  const range = `${fmtDate(start)} – ${fmtDate(end)}`;
  const lines: string[] = [];
  lines.push(`Good morning Drew,`);
  lines.push("");
  lines.push(`Here's your week at a glance — ${range}.`);
  lines.push("");

  // ── Tasks due this week ──────────────────────────────────────────────
  if (open.length === 0) {
    lines.push(
      tasks.length === 0
        ? `TASKS THIS WEEK — nothing scheduled.`
        : `TASKS THIS WEEK — ✓ all ${tasks.length} done. Nice.`,
    );
  } else {
    lines.push(`TASKS THIS WEEK (${open.length} open${doneCount ? `, ${doneCount} done` : ""})`);
    for (const o of open) {
      const cat = CATEGORIES[o.category]?.label ?? "";
      lines.push(`  • ${fmtDate(o.date)} — ${o.label}${cat ? `  [${cat}]` : ""}`);
    }
  }
  lines.push("");

  // ── Files to import ──────────────────────────────────────────────────
  const imports = importsForWeek(start, end);
  if (imports.length) {
    lines.push(`FILES TO IMPORT THIS WEEK`);
    for (const r of imports) {
      lines.push(`  • ${r.label} — ${r.when}  (feeds ${r.feeds})`);
    }
    lines.push("");
  }

  // ── Outstanding GL uploads (operating statements behind the prior month) ──
  const behind = outstanding?.behind ?? [];
  if (outstanding && behind.length) {
    const exp = `${MON_SHORT[outstanding.expected.period - 1]} ${outstanding.expected.year}`;
    lines.push(`OUTSTANDING GL UPLOADS — not yet posted through ${exp} (${behind.length})`);
    for (const b of behind) {
      const through = b.latest ? `through ${MON_SHORT[b.latest.period - 1]} ${b.latest.year}` : "no GL yet";
      lines.push(`  • ${b.propertyCode} — ${b.name}  (${through})`);
    }
    lines.push(`  → Post PM & AP, close the month, then upload each GL: https://portal.kormancommercial.com/financials/operating-statements`);
    lines.push("");
  }

  // ── Tenants to close out (recently vacated) ──────────────────────────────
  if (vacated.length) {
    lines.push(`TENANTS TO CLOSE OUT — vacated in the last ~60 days (${vacated.length})`);
    for (const v of vacated) {
      lines.push(`  • ${v.occupantName} — ${v.propertyCode} · ${v.unitRef}${v.sqft ? ` · ${v.sqft.toLocaleString()} sf` : ""}`);
    }
    lines.push(`  → Run each move-out CAM/RET close-out: https://portal.kormancommercial.com/cam-recon/interim`);
    lines.push("");
  }

  lines.push(`Open the tracker: https://portal.kormancommercial.com/tracker`);
  lines.push("");
  lines.push(`— KCP Portal`);

  const parts: string[] = [];
  if (open.length) parts.push(`${open.length} task${open.length === 1 ? "" : "s"}`);
  if (behind.length) parts.push(`${behind.length} GL upload${behind.length === 1 ? "" : "s"} behind`);
  if (vacated.length) parts.push(`${vacated.length} to close out`);
  const subject = parts.length ? `Your week — ${parts.join(", ")} (${range})` : `Your week — all clear (${range})`;

  return { subject, textBody: lines.join("\n"), open, doneCount, imports, behind, vacated };
}

async function runDigest(req: Request) {
  const now = new Date();
  const { start, end } = weekBounds(now);
  const tasks = taskOccurrencesBetween(start, end);

  let completions: Record<string, unknown> = {};
  try { completions = await getCompletions(); } catch { /* best-effort */ }

  let outstanding: { expected: { year: number; period: number }; behind: OutstandingGl[] } | null = null;
  try { outstanding = await outstandingGlUploads(now); } catch { /* best-effort */ }

  let vacated: VacatedTenant[] = [];
  try { vacated = await recentlyVacatedTenants(now); } catch { /* best-effort */ }

  const { subject, textBody, open, doneCount, imports, behind } = buildDigest(now, tasks, completions, outstanding, vacated);

  const url = new URL(req.url);
  const toOverride = url.searchParams.get("to");
  const to = toOverride && process.env.NODE_ENV !== "production" ? toOverride : DIGEST_TO;

  if (!isMailConfigured()) {
    // Return the digest so a dev/manual call can still preview it.
    return NextResponse.json({ sent: false, reason: "mail-not-configured", subject, textBody });
  }

  const ok = await sendMail({ to, from: DIGEST_FROM, subject, textBody });
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
