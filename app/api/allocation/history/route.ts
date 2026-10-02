import { NextResponse } from "next/server";
import { listPendingSends } from "@/lib/allocated-invoicer/pendingSendStore";
import { listAllocationRuns } from "@/lib/allocated-invoicer/runStore";
import { listAvidSends } from "@/lib/invoicing/avidSendLog";
import { getInvoiceArchive } from "@/lib/allocated-invoicer/invoiceArchive";
import { periodKey } from "@/lib/invoicing/unsent";

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
};

// GET — the Allocated Expense Invoicer's Monthly History: every period, newest
// first, merged from the invoicer's own sent record (staged send → sentAt),
// the AP send log and the allocation run log, with the archived invoice PDFs.
export async function GET() {
  const [pending, runs, sends] = await Promise.all([
    listPendingSends().catch(() => []),
    listAllocationRuns().catch(() => []),
    listAvidSends(400).catch(() => []),
  ]);
  const by = new Map<string, HistoryPeriod>();
  const get = (raw: string, label?: string) => {
    const k = periodKey(raw);
    if (!by.has(k)) by.set(k, { period: raw, label: labelOf(k, label), sentAt: null, sentBy: null, total: null, invoiceCount: null, byProperty: [], invoices: null });
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
    if (p.sentAt) { h.sentAt = p.sentAt; h.sentBy = p.sentBy ?? h.sentBy; } else if (!h.sentAt) h.staged = true;
    h.total = p.summary?.total ?? h.total;
    h.invoiceCount = p.summary?.invoiceCount ?? h.invoiceCount;
    if (p.summary?.byProperty?.length) h.byProperty = p.summary.byProperty;
  }
  const list = [...by.values()].sort((a, b) => periodKey(b.period).localeCompare(periodKey(a.period)));
  await Promise.all(list.slice(0, 36).map(async (h) => {
    const a = await getInvoiceArchive(h.period).catch(() => null);
    if (a) h.invoices = a.invoices.map((i) => ({ fileName: i.fileName, propertyLabel: i.propertyLabel }));
  }));
  return NextResponse.json({ periods: list });
}
