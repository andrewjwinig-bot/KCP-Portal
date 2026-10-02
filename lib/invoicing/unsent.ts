// "GENERATED BUT NEVER SENT TO AVIDXCHANGE" — the AP Outbox's warning row.
//
// Each invoicer records that its batch was PROCESSED somewhere other than the
// send: the Allocated Invoicer logs a run when its zip or Excel is DOWNLOADED,
// a credit-card statement and a payroll period are SAVED. Read alone, that
// reads as done — the dashboard said "Allocated Expenses · Processed Sep 24"
// while nothing had gone to Avid. So the outbox compares the newest processed
// batch of each flow against the send log, and a batch with no send at or
// after it is shown as NOT SENT. Pure — pinned by its test.

export type UnsentSource = "allocated" | "credit-card" | "payroll";
export type Processed = { source: UnsentSource; label: string; period: string; at: string; by?: string | null };
export type Sent = { source: string; sentAt: string };
export type Unsent = Processed & { days: number };

/** The send log began here; a batch processed earlier cannot be judged. */
export const SEND_LOG_START = "2026-09-20";
/** A send up to two days BEFORE the batch was saved still counts — some flows
 *  save the period after releasing it. */
const GRACE_MS = 2 * 86_400_000;
/** Older than this is history, not a to-do. */
const RECENT_DAYS = 60;

export function unsentBatches(processed: Processed[], sends: Sent[], now = new Date()): Unsent[] {
  const newest = new Map<UnsentSource, Processed>();
  for (const p of processed) {
    const t = Date.parse(p.at);
    if (!Number.isFinite(t)) continue;
    const cur = newest.get(p.source);
    if (!cur || Date.parse(cur.at) < t) newest.set(p.source, p);
  }
  const out: Unsent[] = [];
  for (const p of newest.values()) {
    const t = Date.parse(p.at);
    if (p.at.slice(0, 10) < SEND_LOG_START) continue;
    const days = Math.floor((now.getTime() - t) / 86_400_000);
    if (days > RECENT_DAYS) continue;
    const sent = sends.some((s) => s.source === p.source && Date.parse(s.sentAt) >= t - GRACE_MS);
    if (!sent) out.push({ ...p, days });
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
