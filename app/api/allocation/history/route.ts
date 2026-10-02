import { NextResponse } from "next/server";
import { listPendingSends } from "@/lib/allocated-invoicer/pendingSendStore";
import { listAllocationRuns } from "@/lib/allocated-invoicer/runStore";
import { listAvidSends } from "@/lib/invoicing/avidSendLog";
import { getInvoiceArchive } from "@/lib/allocated-invoicer/invoiceArchive";
import { periodKey } from "@/lib/invoicing/unsent";
import { getAllocLedger } from "@/lib/allocated-invoicer/carryoverStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function labelOf(key: string, fallback?: string): string {
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const r = key.match(/^(\d{4})-(\d{2})_to_(\d{4})-(\d{2})$/);
  if (r) return `${MONTHS[Number(r[2]) - 1].slice(0, 3)} ${r[1]} – ${MONTHS[Number(r[4]) - 1].slice(0, 3)} ${r[3]}`;
  return fallback || key;
}

export type HistoryPeriod = {
  period: string; label: string;
  /** When it reached AvidXchange — null when only a run was recorded. */
  sentAt: string | null; sentBy: string | null;
  total: number | null; invoiceCount: number | null;
  byProperty: { code: string; name: string; amount: number }[];
  /** The archived PDFs (names only) — null when the month predates the archive. */
  invoices: { fileName: string; propertyLabel: string }[] | null;
  /** Staged from a GL import but not sent (held, or a send that failed). */
  staged?: boolean;
  /** One answer to "did this reach AvidXchange?":
   *  - sent           — this period's own send is on record
   *  - sent-in-batch  — went out inside a multi-month batch (`batch` names it)
   *  - finalized      — its carryover was closed (the old manual Finalize, or a
   *                     batch superseding it) but NO send is on record — check
   *                     AvidXchange; the portal cannot prove it went
   *  - not-sent       — staged and still open: `sendable`, the Send button
   *  - run-only       — processed (zip downloaded) but never staged or closed */
  status: "sent" | "sent-in-batch" | "finalized" | "not-sent" | "run-only";
  batch?: string | null;
  /** A staged send the Send button can deliver now. */
  sendable?: boolean;
};

/** The YYYY-MM months a "YYYY-MM_to_YYYY-MM" range covers (or the one month). */
function monthsOf(key: string): string[] {
  const r = key.match(/^(\d{4})-(\d{2})_to_(\d{4})-(\d{2})$/);
  if (!r) return /^\d{4}-\d{2}$/.test(key) ? [key] : [];
  const out: string[] = [];
  let y = Number(r[1]), m = Number(r[2]);
  const ey = Number(r[3]), em = Number(r[4]);
  while ((y < ey || (y === ey && m <= em)) && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

// GET — the Allocated Expense Invoicer's Monthly History: every period, newest
// first, merged from the invoicer's own sent record (staged send → sentAt),
// the AP send log and the allocation run log, with the archived invoice PDFs.
export async function GET() {
  const [pending, runs, sends, ledger] = await Promise.all([
    listPendingSends().catch(() => []),
    listAllocationRuns().catch(() => []),
    listAvidSends(400).catch(() => []),
    getAllocLedger().catch(() => null),
  ]);
  const committed = new Set(ledger?.committedPeriods ?? []);
  const by = new Map<string, HistoryPeriod>();
  const get = (raw: string, label?: string) => {
    const k = periodKey(raw);
    if (!by.has(k)) by.set(k, { period: raw, label: labelOf(k, label), sentAt: null, sentBy: null, total: null, invoiceCount: null, byProperty: [], invoices: null, status: "run-only" });
    return by.get(k)!;
  };
  for (const r of runs) {
    const h = get(r.statementMonth || r.periodText, r.periodText);
    if (h.total == null && r.total != null) h.total = r.total;
    if (!h.byProperty.length && r.byProperty?.length) h.byProperty = r.byProperty;
  }
  for (const s of sends.filter((x) => x.source === "allocated")) {
    const h = get(s.period);
    if (!h.sentAt || s.sentAt > h.sentAt) { h.sentAt = s.sentAt; h.sentBy = s.sentBy ?? h.sentBy; }
    h.total = s.total ?? h.total; h.invoiceCount = s.invoiceCount ?? h.invoiceCount;
  }
  for (const p of pending.filter((x) => x.source === "allocated")) {
    const h = get(p.period, p.label);
    h.period = p.period;
    if (p.sentAt) { h.sentAt = p.sentAt; h.sentBy = p.sentBy ?? h.sentBy; } else if (!h.sentAt && !p.finalizedAt) h.staged = true;
    h.total = p.summary?.total ?? h.total;
    h.invoiceCount = p.summary?.invoiceCount ?? h.invoiceCount;
    if (p.summary?.byProperty?.length) h.byProperty = p.summary.byProperty;
  }
  // A sent multi-month batch covers each of its months: they went out in it.
  const sentRanges = [...by.entries()].filter(([k, h]) => k.includes("_to_") && h.sentAt);
  for (const [k, h] of sentRanges) {
    for (const m of monthsOf(k)) {
      const mh = by.get(m) ?? get(m);
      // A month with its OWN staged send still open is not claimed for the
      // batch: if it was finalized before the batch ran, the batch skipped it
      // (Jan–Aug billed $478 while July's own $14,711 sat staged) — it is
      // judged on its own below rather than called sent.
      if (mh.sentAt || mh.staged) continue;
      mh.sentAt = h.sentAt; mh.sentBy = h.sentBy; mh.batch = h.label; mh.staged = false;
    }
  }
  for (const [k, h] of by) {
    const months = monthsOf(k);
    const allClosed = months.length > 0 && months.every((m) => committed.has(m));
    if (h.sentAt) h.status = h.batch ? "sent-in-batch" : "sent";
    else if (allClosed) { h.status = "finalized"; h.staged = false; }
    else if (h.staged) { h.status = "not-sent"; h.sendable = true; }
    else h.status = "run-only";
  }
  // A range sorts at its LAST month, just above that month's own row.
  const sortKey = (p: string) => { const k = periodKey(p); const r = k.match(/_to_(\d{4}-\d{2})$/); return r ? `${r[1]}~` : k; };
  const list = [...by.values()].sort((a, b) => sortKey(b.period).localeCompare(sortKey(a.period)));
  await Promise.all(list.slice(0, 36).map(async (h) => {
    const a = await getInvoiceArchive(h.period).catch(() => null);
    if (a) h.invoices = a.invoices.map((i) => ({ fileName: i.fileName, propertyLabel: i.propertyLabel }));
  }));
  return NextResponse.json({ periods: list });
}
