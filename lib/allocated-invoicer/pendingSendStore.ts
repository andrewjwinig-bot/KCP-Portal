// "Pending Avid send" queue. When a GL/register imports, the run is prepared
// (computed + previewed) but NOT sent to AvidXchange — it's staged here so a
// person can review the per-property summary and give the final okay before the
// invoices go out. The stashed GL (base64) lets the send recompute the exact
// invoices at confirm time, so nothing drifts between prepare and send.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "invoicer-pending-sends";
const ID = "queue";

export type PendingSource = "allocated" | "credit-card" | "payroll";

export type PendingSummary = {
  byProperty: { code: string; name: string; amount: number }[];
  total: number;
  invoiceCount: number;
};

export type PendingSend = {
  source: PendingSource;
  /** Statement month, e.g. "2026-06". Unique per source. */
  period: string;
  /** Human label, e.g. "June 2026" or the period text. */
  label: string;
  summary: PendingSummary;
  /** The source Excel file (base64) to recompute the invoices at send time.
   *  Present for a GL/register upload. */
  fileBase64?: string;
  /** A serialized GLParseResult, for a send whose source isn't an Excel file
   *  (e.g. allocation staged from a posting report). Used in place of fileBase64. */
  glJson?: string;
  fileName?: string;
  preparedAt: string;
  preparedBy?: string | null;
  /** Set once actually sent to Avid. */
  sentAt?: string | null;
  sentBy?: string | null;
};

const keyOf = (source: PendingSource, period: string) => `${source}:${period}`;

export async function listPendingSends(): Promise<PendingSend[]> {
  const rec = (await getJSON(PREFIX, ID)) as { items?: Record<string, PendingSend> } | null;
  return Object.values(rec?.items ?? {});
}

export async function getPendingSend(source: PendingSource, period: string): Promise<PendingSend | null> {
  const rec = (await getJSON(PREFIX, ID)) as { items?: Record<string, PendingSend> } | null;
  return rec?.items?.[keyOf(source, period)] ?? null;
}

/** Stage (or refresh) a pending send. Re-preparing the same period overwrites,
 *  unless it's already been sent — a sent period stays sent (idempotent). */
export async function savePendingSend(rec: PendingSend): Promise<PendingSend> {
  const cur = (await getJSON(PREFIX, ID)) as { items?: Record<string, PendingSend> } | null;
  const items = { ...(cur?.items ?? {}) };
  const k = keyOf(rec.source, rec.period);
  const existing = items[k];
  if (existing?.sentAt) return existing; // already sent — don't re-stage
  items[k] = rec;
  await storeJSON(PREFIX, ID, { items });
  return rec;
}

/** Mark a pending send as sent (keeps the record for the audit trail). */
export async function markPendingSent(source: PendingSource, period: string, by?: string | null): Promise<void> {
  const cur = (await getJSON(PREFIX, ID)) as { items?: Record<string, PendingSend> } | null;
  const items = { ...(cur?.items ?? {}) };
  const k = keyOf(source, period);
  if (items[k]) {
    items[k] = { ...items[k], sentAt: new Date().toISOString(), sentBy: by ?? null };
    await storeJSON(PREFIX, ID, { items });
  }
}
