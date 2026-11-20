import { NextResponse } from "next/server";
import { listPendingSends } from "@/lib/allocated-invoicer/pendingSendStore";
import { listAllocationRuns } from "@/lib/allocated-invoicer/runStore";
import { listAvidSends } from "@/lib/invoicing/avidSendLog";
import { getInvoiceArchive } from "@/lib/allocated-invoicer/invoiceArchive";
import { periodKey } from "@/lib/invoicing/unsent";
import { getAllocLedger } from "@/lib/allocated-invoicer/carryoverStore";
import { previewAllocationSend } from "@/lib/allocated-invoicer/autoProcess";
import { getPendingGlMeta } from "@/lib/allocated-invoicer/pendingGlStore";

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
  /** The PDFs shown are REBUILT from the GL, not the originals as sent. */
  reconstructed?: boolean;
  reconstructedAt?: string | null;
  /** Each building rebuilt vs what the original run recorded. */
  checks?: { code: string; name: string; rebuilt: number; original: number | null }[] | null;
  /** No PDFs on file, and the imported full-year GL covers the month — it can
   *  be rebuilt (`reconstructMonth`). */
  rebuildable?: boolean;
};

// GET — the Allocated Expense Invoicer's Monthly History: one row per MONTH,
// newest first, merged from the invoicer's own sent record (staged send →
// sentAt), the AP send log and the allocation run log, with the archived PDFs.
//
// A send is filed under its GL's LAST month (owner: "i run the full year GL
// just to capture any new postings but its generally just the last months GL
// that we need to label it as"). A Jan–Jul GL bills July — the months before
// it were billed when they closed — plus any charges posted late to them, so
// it reads "July 2026 + late charges (Mar)", not "Jan – Jul 2026".
const monthOf = (raw: string) => { const k = periodKey(raw); const r = k.match(/_to_(\d{4}-\d{2})$/); return r ? r[1] : k; };

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
    const k = monthOf(raw);
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
    if (!h.sentAt || s.sentAt > h.sentAt) { h.sentAt = s.sentAt; h.sentBy = s.sentBy ?? h.sentBy; h.period = s.period; h.total = s.total ?? h.total; h.invoiceCount = s.invoiceCount ?? h.invoiceCount; }
  }
  // Oldest prepared first, so the newest staged send for a month is the one
  // the row sends; a sent one is never displaced by a later unsent one.
  const ordered = pending.filter((x) => x.source === "allocated").sort((a, b) => (a.preparedAt || "").localeCompare(b.preparedAt || ""));
  const batches: { months: string[]; h: HistoryPeriod }[] = [];
  for (const p of ordered) {
    const h = get(p.period, p.label);
    const open = !p.sentAt && !p.finalizedAt;
    if (!p.sentAt && h.sentAt && !open) continue;
    if (p.sentAt) { if (h.sentAt && p.sentAt < h.sentAt && h.period !== p.period) continue; h.sentAt = p.sentAt; h.sentBy = p.sentBy ?? h.sentBy; h.staged = false; }
    else if (open && !h.sentAt) h.staged = true;
    h.period = p.period;
    if (p.billedLabel) h.label = p.billedLabel;
    h.total = p.summary?.total ?? h.total;
    h.invoiceCount = p.summary?.invoiceCount ?? h.invoiceCount;
    if (p.summary?.byProperty?.length) h.byProperty = p.summary.byProperty;
    if (p.sentAt && (p.billedMonths?.length ?? 0) > 1) batches.push({ months: p.billedMonths!, h });
  }
  // A send that billed SEVERAL new months (an import skipped a month) went out
  // for each of them — mark the earlier ones sent in it.
  for (const { months, h } of batches) {
    for (const m of months) {
      const mh = by.get(m) ?? get(m);
      if (mh === h || mh.sentAt || mh.staged) continue;
      mh.sentAt = h.sentAt; mh.sentBy = h.sentBy; mh.batch = h.label;
    }
  }
  for (const [k, h] of by) {
    if (h.sentAt) h.status = h.batch ? "sent-in-batch" : "sent";
    else if (h.staged) { h.status = "not-sent"; h.sendable = true; }
    else if (committed.has(k)) h.status = "finalized";
    else h.status = "run-only";
  }
  // "Not sent" is judged by the SEND's own computation: a staged send with
  // nothing left to bill (every charge already allocated when its month
  // closed) is finalized, not sendable — the preview also records it so.
  await Promise.all([...by.values()].filter((h) => h.status === "not-sent").map(async (h) => {
    const pv = await previewAllocationSend(h.period).catch(() => null);
    if (pv && !("error" in pv)) {
      if (pv.nothingToSend) { h.status = committed.has(monthOf(h.period)) ? "finalized" : "run-only"; h.staged = false; h.sendable = false; }
      else if (pv.label) h.label = pv.label;
    }
  }));
  const entries = [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const gl = await getPendingGlMeta().catch(() => null);
  const glThrough = gl ? `${gl.year}-${String(gl.month).padStart(2, "0")}` : null;
  await Promise.all(entries.slice(0, 36).map(async ([k, h]) => {
    // The originals live under the send's own key; a rebuilt month under the month.
    const a = (await getInvoiceArchive(h.period).catch(() => null)) ?? (h.period !== k ? await getInvoiceArchive(k).catch(() => null) : null);
    if (a) {
      h.invoices = a.invoices.map((i) => ({ fileName: i.fileName, propertyLabel: i.propertyLabel }));
      if (a.reconstructed) { h.reconstructed = true; h.reconstructedAt = a.reconstructedAt ?? null; h.checks = a.checks ?? null; h.period = a.period; }
    }
    const billed = h.status === "sent" || h.status === "sent-in-batch" || h.status === "finalized" || h.status === "run-only";
    if ((!a || a.reconstructed) && billed && gl && glThrough && /^\d{4}-\d{2}$/.test(k) && k.slice(0, 4) === String(gl.year) && k <= glThrough) h.rebuildable = true;
  }));
  const list = entries.map(([, h]) => h);
  return NextResponse.json({ periods: list });
}
