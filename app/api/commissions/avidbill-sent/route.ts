import { NextResponse } from "next/server";
import { getJSON } from "@/lib/storage";
import { canonicalQuarter, type CommissionEntry } from "@/lib/commissions";
import { loadCommissionHistory, type HistoryInvoice } from "@/lib/commissions/history";

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
    // What went to Avid, as sent — per quarter, split office / retail — and
    // which quarters each page reads as SENT (every entry of that kind in the
    // quarter is on record), since Nancy's and Harry's are sent separately.
    const [history, office, retail] = await Promise.all([
      loadCommissionHistory(),
      getJSON(PREFIX, "entries").then((v) => (Array.isArray(v) ? v : []) as CommissionEntry[]).catch(() => [] as CommissionEntry[]),
      getJSON(PREFIX, "entries-retail").then((v) => (Array.isArray(v) ? v : []) as CommissionEntry[]).catch(() => [] as CommissionEntry[]),
    ]);
    const sentByKind: Record<"office" | "retail", Record<string, { sentAt: string; count: number; total: number }>> = { office: {}, retail: {} };
    const historyByKind: Record<"office" | "retail", Record<string, HistoryInvoice[]>> = { office: {}, retail: {} };
    for (const [q, invs] of Object.entries(history)) {
      for (const kind of ["office", "retail"] as const) {
        const sent = Object.values(invs).filter((i) => i.kind === kind);
        if (sent.length === 0) continue;
        historyByKind[kind][q] = sent;
        const live = (kind === "office" ? office : retail).filter((e) => canonicalQuarter(e.quarter) === q);
        if (live.every((e) => invs[e.id])) {
          sentByKind[kind][q] = {
            sentAt: sent.map((i) => i.sentAt).sort().pop()!,
            count: sent.length,
            total: Math.round(sent.reduce((s, i) => s + i.amount, 0) * 100) / 100,
          };
        }
      }
    }
    return NextResponse.json({ log, review, sentByKind, history: historyByKind });
  } catch {
    return NextResponse.json({ log: {}, review: {}, sentByKind: { office: {}, retail: {} }, history: { office: {}, retail: {} } });
  }
}
