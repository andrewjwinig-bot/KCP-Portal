// Audit log of every batch released to AvidXchange — the "AP outbox". One record
// per (source, period); a retry that finishes stragglers updates the same record.
// Records who sent it, when, how many invoices, and the total, so there's a
// durable, timestamped trail of what went to AP.

import "server-only";
import { getJSON, storeJSON, listJSON } from "@/lib/storage";

const PREFIX = "avid-send-log";
const idFor = (source: string, period: string) =>
  `${source}-${period}`.replace(/[^0-9A-Za-z]+/g, "-") || "unknown";

export type AvidSource = "allocated" | "credit-card" | "payroll";

export type AvidSendEntry = {
  source: AvidSource;
  /** "Allocated Expenses" | "Credit Card Expenses" | "Payroll". */
  label: string;
  /** Period key (YYYY-MM, a range, or a pay date). */
  period: string;
  sentAt: string;
  sentBy: string | null;
  invoiceCount: number;
  propertyCount: number;
  total: number;
  /** True while some invoices still haven't gone out (a retry can finish them). */
  partial: boolean;
};

export async function recordAvidSend(entry: AvidSendEntry): Promise<void> {
  await storeJSON(PREFIX, idFor(entry.source, entry.period), entry);
}

export async function getAvidSend(source: string, period: string): Promise<AvidSendEntry | null> {
  return (await getJSON(PREFIX, idFor(source, period))) as AvidSendEntry | null;
}

/** Every logged send, newest first. */
export async function listAvidSends(limit = 40): Promise<AvidSendEntry[]> {
  const all = (await listJSON(PREFIX)) as AvidSendEntry[];
  return all
    .filter((e) => e && e.sentAt)
    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))
    .slice(0, limit);
}

/** The latest send for one flow (for a page's "last sent to Avid" line). */
export async function lastAvidSend(source: AvidSource): Promise<AvidSendEntry | null> {
  const all = (await listJSON(PREFIX)) as AvidSendEntry[];
  return all
    .filter((e) => e && e.source === source && e.sentAt)
    .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))[0] ?? null;
}
