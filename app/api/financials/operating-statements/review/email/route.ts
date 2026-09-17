import { NextResponse } from "next/server";
import { reviewFlaggedLines } from "@/lib/financials/operating-statements/review";
import { buildReviewChecklistXlsx } from "@/lib/financials/operating-statements/reviewWorkbook";
import { sendMail, isMailConfigured, VERIFIED_FROM } from "@/lib/mail";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { isPathAllowed, ALL_USERS, type UserId } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// A cross-property sweep of every month of every property is the slowest read
// this feature does, and it is the whole point of the email.
export const maxDuration = 300;

/**
 * Who gets the month's checklist.
 *
 * `REVIEW_CHECKLIST_TO` overrides it with no deploy, and accepts a
 * comma-separated list. It falls back to the same verified sender the rest of
 * the portal's mail uses, so the feature works before anyone configures it
 * rather than silently addressing nobody.
 */
function recipients(): string[] {
  const raw = (process.env.REVIEW_CHECKLIST_TO ?? VERIFIED_FROM).trim();
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Gated with the other statement pages — the checklist carries GL figures. */
async function authorized(): Promise<boolean> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  try {
    const id = await verifySiteToken((await cookies()).get(SITE_COOKIE)?.value, secret);
    return !!id && (ALL_USERS as readonly string[]).includes(id) && isPathAllowed(id as UserId, "/financials");
  } catch { return false; }
}

// POST { year? } — build the cross-property checklist and email it as one xlsx.
//
// Fired automatically once an import's auto-explain has finished (so the notes
// are IN the file rather than arriving empty), and available on demand from the
// Flags to Investigate page.
export async function POST(req: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Not authorized." }, { status: 403 });

  let body: { year?: number } = {};
  try { body = await req.json(); } catch { /* year is optional */ }
  const year = Number(body.year) || new Date().getFullYear();

  try {
    const data = await reviewFlaggedLines(year);
    const totals = data.totals;
    const items = totals.flaggedMonthCount + totals.issueCount;

    // Nothing to work through is a real outcome, and mailing an empty checklist
    // every import is how a useful email becomes one nobody opens.
    if (items === 0) {
      return NextResponse.json({ sent: false, items: 0, reason: "Nothing to resolve — no email sent." });
    }
    if (!isMailConfigured()) {
      return NextResponse.json({ sent: false, items, reason: "Mail isn't configured." });
    }

    const buf = await buildReviewChecklistXlsx(data);
    const to = recipients();
    const subject =
      `Operating statements — ${items} item${items === 1 ? "" : "s"} to resolve` +
      (totals.issueCount ? ` (${totals.issueCount} missing)` : "") +
      ` · ${year}`;

    const lines = [
      `${items} open item${items === 1 ? "" : "s"} across ${totals.propertiesWithIssues || data.properties.filter((p) => p.lines.length || p.issues.length).length} properties.`,
      "",
      totals.issueCount
        ? `${totals.issueCount} of them are MISSING — a line that should carry a figure and reads $0. Those lead the list; the statement isn't finished until each is posted or ruled out.`
        : "Nothing is missing — every budgeted line and scheduled debt payment posted.",
      `${totals.flaggedMonthCount} are REVIEW — a line that posted something that looks off, with the specific charge named where we could identify it.`,
      "",
      "The attached workbook is one printable checklist, grouped by property with a box to tick against each item.",
      "Only variances of $500 or more are listed; anything smaller isn't worth the time.",
      "",
      totals.tieOutIssues ? `NOTE: ${totals.tieOutIssues} propert${totals.tieOutIssues === 1 ? "y's" : "ies'"} GL doesn't reconcile with itself — that import may be partial.` : "",
      totals.coverageGaps ? `NOTE: ${totals.coverageGaps} propert${totals.coverageGaps === 1 ? "y is" : "ies are"} behind on posting.` : "",
      "",
      "Dismissing an item on the statement, or in Flags to Investigate, drops it from next month's list.",
    ].filter((l) => l !== "");

    const ok = await sendMail({
      // Postmark takes a comma-separated string, not a list.
      to: to.join(", "),
      from: VERIFIED_FROM,
      subject,
      textBody: lines.join("\n"),
      attachments: [{
        name: `Operating Statements - Items to Resolve - ${year}.xlsx`,
        content: buf,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }],
    });

    return NextResponse.json({ sent: !!ok, items, missing: totals.issueCount, to });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to send the checklist" }, { status: 500 });
  }
}
