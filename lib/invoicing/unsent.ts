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
export type Sent = { source: string; sentAt: string; period?: string };

const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
/** "August 2026", "Aug 2026", "2026-08" → "2026-08"; anything else as-is. */
export function periodKey(p: string | null | undefined): string {
  const t = String(p ?? "").trim().toLowerCase();
  const iso = t.match(/^(\d{4})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const m = t.match(/^([a-z]+)\s+(\d{4})$/);
  if (m) { const i = MONTHS.findIndex((x) => x.startsWith(m[1].slice(0, 3))); if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, "0")}`; }
  return t;
}
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
    // Sent = a send of this flow at or after the batch, OR one recorded for the
    // SAME period whenever it went (a batch re-downloaded after it was sent).
    const sent = sends.some((s) => s.source === p.source
      && (Date.parse(s.sentAt) >= t - GRACE_MS || (!!s.period && periodKey(s.period) === periodKey(p.period))));
    if (!sent) out.push({ ...p, days });
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
