// The record of what went to AvidXchange, quarter by quarter (owner: "store
// historical records once they're sent to avid so she can reference prior
// quarters with the detail"). Each invoice is snapshotted AS SENT — tenant,
// building, suite, SF, term, lease, incentive, the billed amount and its
// invoice number — the moment it is delivered, so a later edit or delete of
// the live entry never changes what a past quarter shows.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { canonicalQuarter, type CommissionEntry } from "@/lib/commissions";
import { commissionInvoiceDate, commissionInvoiceNumber } from "@/lib/pdf/renderCommissionInvoicePdf";

const PREFIX = "commissions";
const HISTORY_ID = "history";

export type HistoryInvoice = {
  entry: CommissionEntry;
  kind: "office" | "retail";
  amount: number;
  invoiceNumber: string;
  invoiceDate: string | null;
  sentAt: string;
};
/** quarter ("Q3 26") → entry id → the invoice as sent. */
export type CommissionHistory = Record<string, Record<string, HistoryInvoice>>;

export async function loadCommissionHistory(): Promise<CommissionHistory> {
  const raw = await getJSON(PREFIX, HISTORY_ID);
  return (raw && typeof raw === "object" ? raw : {}) as CommissionHistory;
}

/** Snapshot the invoices just delivered. An invoice already recorded keeps
 *  its first record — that is the one Avid has. */
export async function recordSentInvoices(
  quarterLabel: string,
  rows: { entry: CommissionEntry; kind: "office" | "retail"; amount: number }[],
): Promise<void> {
  if (rows.length === 0) return;
  const q = canonicalQuarter(quarterLabel);
  const history = await loadCommissionHistory();
  const quarter = history[q] ?? {};
  const now = new Date().toISOString();
  let changed = false;
  for (const r of rows) {
    if (quarter[r.entry.id]) continue;
    quarter[r.entry.id] = {
      entry: { ...r.entry, quarter: q },
      kind: r.kind,
      amount: r.amount,
      invoiceNumber: commissionInvoiceNumber({ ...r.entry, quarter: q }),
      invoiceDate: commissionInvoiceDate({ quarter: q }),
      sentAt: now,
    };
    changed = true;
  }
  if (!changed) return;
  history[q] = quarter;
  await storeJSON(PREFIX, HISTORY_ID, history);
}
