import { NextResponse } from "next/server";
import { getJSON } from "@/lib/storage";
import { canonicalQuarter } from "@/lib/commissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIX = "commissions";
const SENT_LOG_ID = "avidbill-sent";

/** Reflects the avidbill-sent log so the commissions page can stamp
 *  "Sent to AvidXchange on MM/DD/YY" on every row whose quarter has
 *  already been billed. Read-only; the log is written by
 *  sendQuarterToAvidBill on successful sends. */
export async function GET() {
  try {
    const raw = await getJSON(PREFIX, SENT_LOG_ID);
    const stored = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
    // Keyed by the label the pages save ("Q3 26") as well as as stored — a
    // record written as "3rd Quarter 2026" must still stamp the Q3 26 card.
    const log: Record<string, unknown> = { ...stored };
    for (const [k, v] of Object.entries(stored)) log[canonicalQuarter(k)] ??= v;
    // Alison's review per quarter — when she was asked and when she approved —
    // so a pending quarter can say whose move it is.
    const rv = await getJSON(PREFIX, "review-log").catch(() => null);
    const review: Record<string, { requestedAt: string | null; approvedAt: string | null; approvedBy: string | null }> = {};
    for (const [q, rec] of Object.entries((rv && typeof rv === "object" ? rv : {}) as Record<string, { requests?: { at: string }[]; approvals?: { at: string; by: string }[] }>)) {
      const req = rec.requests?.[rec.requests.length - 1];
      const app = rec.approvals?.[rec.approvals.length - 1];
      review[q] = { requestedAt: req?.at ?? null, approvedAt: app?.at ?? null, approvedBy: app?.by ?? null };
    }
    return NextResponse.json({ log, review });
  } catch {
    return NextResponse.json({ log: {}, review: {} });
  }
}
