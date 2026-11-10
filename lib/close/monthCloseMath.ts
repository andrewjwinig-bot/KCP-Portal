// Pure pieces of the month-end close (`monthClose.ts`) — pinned by
// `monthCloseMath.test.ts`. Client-safe.

export type CloseDetail = { text: string; meta?: string; href?: string; tone?: "red" | "amber" | "neutral" };
export type CloseItem = {
  id: string;
  label: string;
  /** Who does it — "Automatic" where the portal sends it itself. */
  owner: string;
  /** When it is due, in plain words. */
  due: string;
  link: string;
  done: boolean;
  /** One phrase, said in words on the row's right. */
  status: string;
  /** What is left — the properties still to import, the accounts out of
   *  balance, the close-outs in flight. Empty when there is nothing to name. */
  detail: CloseDetail[];
};
export type CloseSection = { id: string; label: string; items: CloseItem[]; flags?: boolean };

/** The month a close is worked on — last month, in Eastern time. */
export function closeMonthOf(now: Date): string {
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const d = new Date(et.getFullYear(), et.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * The month a send's period names, as "YYYY-MM", or null.
 *  "2026-10", "October 2026", "Oct 2026", "2026-10-16", "10/16/2026", and a
 *  range "2026-09_to_2026-10" (its LAST month — what it billed).
 */
export function periodMonth(p: string | null | undefined): string | null {
  const t = String(p ?? "").trim().toLowerCase();
  if (!t) return null;
  const range = t.match(/(\d{4}-\d{2})\s*_to_\s*(\d{4}-\d{2})/);
  if (range) return range[2];
  const iso = t.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const us = t.match(/^(\d{1,2})\/\d{1,2}\/(\d{4})/);
  if (us) return `${us[2]}-${us[1].padStart(2, "0")}`;
  const named = t.match(/([a-z]+)\s+(\d{4})/);
  if (named) {
    const i = MONTHS.findIndex((x) => x.startsWith(named[1].slice(0, 3)));
    if (i >= 0) return `${named[2]}-${String(i + 1).padStart(2, "0")}`;
  }
  return null;
}

type SendLike = { source: string; period: string; sentAt: string; total: number; partial?: boolean };

/** Sends of one flow for a month, newest first. A send still `partial`
 *  (some invoices did not go) does not count as sent. */
export function sendsForMonth<T extends SendLike>(sends: T[], source: string, month: string): T[] {
  return sends
    .filter((s) => s.source === source && !s.partial && periodMonth(s.period) === month)
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/** Payroll is sent per pay date; the month's sends are the pay dates in it. */
export function payrollSendsIn<T extends SendLike>(sends: T[], month: string): T[] {
  return sendsForMonth(sends, "payroll", month).sort((a, b) => a.period.localeCompare(b.period));
}

/** A quarter-end month's quarter: label "Q3 26" and a matcher for the send
 *  log's period, whichever form it was written in. Null otherwise. */
export function quarterOfMonth(month: string): { label: string; re: RegExp } | null {
  const [y, m] = month.split("-").map(Number);
  if (m % 3 !== 0) return null;
  const q = m / 3;
  const yy = String(y).slice(2);
  return { label: `Q${q} ${yy}`, re: new RegExp(`Q${q}\\D{0,3}(${yy}|${y})\\b`, "i") };
}

type CloseOutLike = {
  status: "waiting" | "ready" | "approved";
  maxPosted: number;
  vacateMonth: number;
  notifiedAt: string | null;
  approvedAt: string | null;
  chargesSentAt?: string | null;
  kind?: "office" | "retail";
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const d = (iso: string | null | undefined) => {
  if (!iso) return "";
  const x = new Date(iso);
  return Number.isNaN(x.getTime()) ? "" : x.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
};

/** Where a close-out stands, in words, and how soon it needs someone:
 *  rank 0 is Drew's to do now, higher is with someone else or waiting. */
export function closeOutStage(c: CloseOutLike): { text: string; rank: number; tone: "red" | "amber" | "neutral" } {
  const approver = c.kind === "retail" ? "Harry" : "Nancy";
  if (c.status === "approved") {
    return c.chargesSentAt
      ? { text: `Charges sent ${d(c.chargesSentAt)}`, rank: 4, tone: "neutral" }
      : { text: `Approved ${d(c.approvedAt)} · charges not sent to Tanya`, rank: 0, tone: "red" };
  }
  if (c.notifiedAt) return { text: `With ${approver} since ${d(c.notifiedAt)}`, rank: 2, tone: "neutral" };
  if (c.status === "ready") return { text: `Ready · send to ${approver}`, rank: 0, tone: "amber" };
  const owed = Math.max(1, Math.min(12, c.vacateMonth));
  return { text: `Waiting on the ${MON[owed - 1]} GL · posted through ${c.maxPosted ? MON[c.maxPosted - 1] : "—"}`, rank: 3, tone: "neutral" };
}
