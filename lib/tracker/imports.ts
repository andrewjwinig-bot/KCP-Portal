// Recurring data imports — the files that have to be refreshed for the portal
// to stay current, surfaced in the weekly digest so nothing goes stale.
//
// This is the source of truth for "what do I need to import." Add/adjust
// entries here; the weekly email and (later) the dashboard read from it.

export type ImportCadence = "monthly" | "weekly" | "quarterly" | "as-needed";

export type ImportReminder = {
  id: string;
  /** The file / report to import. */
  label: string;
  cadence: ImportCadence;
  /** When it's due, in plain words (e.g. "By the 1st"). */
  when: string;
  /** Where it's imported. */
  link: string;
  /** What it feeds / why it matters. */
  feeds: string;
  /**
   * The earliest weekday this can be done (0 = Sunday … 6 = Saturday).
   *
   * A weekly import is not outstanding just because the week has started. The
   * AP Selection Report reflects bills that are PAID on Wednesday, so before
   * Wednesday there is nothing to import — flagging it on Monday is a false
   * alarm, and a reminder that cries wolf twice a week stops being read.
   */
  dueFromWeekday?: number;
  /**
   * Which period this import is for, when it is outstanding.
   *
   * They differ: a rent roll due "by the 1st" is THIS month's, while a GL due
   * "at monthly close" is LAST month's. Saying "August" on a card in September
   * is the difference between a nag and an instruction.
   */
  periodIs?: "current-month" | "prior-month" | "this-week";
};

export const IMPORT_REMINDERS: ImportReminder[] = [
  { id: "imp-rentroll", label: "Rent Roll", cadence: "monthly", when: "By the 1st",
    link: "/rentroll", feeds: "Rent Roll, CAM recon, deposits, commissions" },
  { id: "imp-gl", label: "General Ledger (Skyline)", cadence: "monthly", when: "At monthly close",
    link: "/financials/operating-statements", feeds: "Operating Statements & Cash Analysis", periodIs: "prior-month" },
  { id: "imp-ap", label: "AP Selection Report", cadence: "weekly", when: "Every Wednesday",
    link: "/financials/cash-analysis", feeds: "Import Paid Bills to Cash Sheet", dueFromWeekday: 3 },
  { id: "imp-alloc-gl", label: "2000 G&A GL", cadence: "monthly", when: "At monthly close",
    link: "/allocated-invoicer", feeds: "Allocated Expense invoices", periodIs: "prior-month" },
  { id: "imp-cc", label: "Credit-card statement", cadence: "monthly", when: "At monthly close",
    link: "/expenses", feeds: "Credit Card Expense Coder", periodIs: "prior-month" },
];

/** A recorded import event (client-safe mirror of the server store's value). */
export type ImportEvent = { at: string; by?: string | null };

/**
 * Has this week reached the day the import can actually be done?
 *
 * Only meaningful for a weekly reminder carrying `dueFromWeekday`. Everything
 * else is due as soon as its period starts.
 */
export function reminderDueYet(reminder: ImportReminder, now: Date): boolean {
  if (reminder.cadence !== "weekly" || reminder.dueFromWeekday == null) return true;
  // Days elapsed since Monday, for both — so a Sunday reminder is the END of
  // its week rather than the start of the next one.
  const sinceMon = (d: number) => (d + 6) % 7;
  return sinceMon(now.getDay()) >= sinceMon(reminder.dueFromWeekday);
}

/**
 * Is there anything to do about this reminder right now?
 *
 * The question the dashboard and the digest are actually asking. A reminder
 * whose day has not come is NOT outstanding — it is simply not yet due, which
 * is a different thing from having been missed.
 */
export function reminderOutstanding(reminder: ImportReminder, lastAt: string | undefined, now: Date): boolean {
  return reminderDueYet(reminder, now) && !reminderSatisfied(reminder, lastAt, now);
}

/** Is a reminder satisfied by its last import, given its cadence?
 *  weekly → imported within the current week (Mon–now); monthly/quarterly →
 *  imported within the current calendar month. Pure — safe on client + server. */
export function reminderSatisfied(reminder: ImportReminder, lastAt: string | undefined, now: Date): boolean {
  if (!lastAt) return false;
  const at = new Date(lastAt);
  if (Number.isNaN(at.getTime())) return false;
  if (reminder.cadence === "weekly") {
    const sinceMon = (now.getDay() + 6) % 7;
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMon);
    return at >= weekStart;
  }
  return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
}

/**
 * Where a reminder stands right now — which is the only thing the card is
 * being scanned for.
 *
 *   overdue     — its window has passed and it never happened.
 *   due         — its window is open and it has not happened yet.
 *   not-yet-due — its day has not come (the AP report on a Monday).
 *   done        — it happened this period.
 */
export type ReminderStatus = "overdue" | "due" | "not-yet-due" | "done";

/**
 * How far into the period we are, as a fraction — used to tell "due" from
 * "overdue" without inventing a deadline none of these actually carry.
 *
 * A monthly import that has not happened by the last few days of the month is
 * late in a way one that has not happened on the 3rd is not, and the card
 * should not say the same thing about both.
 */
const OVERDUE_AFTER = 0.75;

export function reminderStatus(reminder: ImportReminder, lastAt: string | undefined, now: Date): ReminderStatus {
  if (reminderSatisfied(reminder, lastAt, now)) return "done";
  if (!reminderDueYet(reminder, now)) return "not-yet-due";
  if (reminder.cadence === "weekly") {
    // Its day has passed (reminderDueYet) and it has not happened. By Friday
    // that is late; on the Wednesday itself it is simply today's job.
    return now.getDay() === 0 || now.getDay() > (reminder.dueFromWeekday ?? 3) + 1 ? "overdue" : "due";
  }
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / days >= OVERDUE_AFTER ? "overdue" : "due";
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The period this import is waiting for — "August", "this week".
 *
 * "Due now" is a nag; "August GL, due now" is an instruction. Null when the
 * reminder does not name a period, rather than guessing at one.
 */
export function reminderPeriodLabel(reminder: ImportReminder, now: Date): string | null {
  const mode = reminder.periodIs ?? (reminder.cadence === "weekly" ? "this-week" : "current-month");
  if (mode === "this-week") return "this week";
  if (mode === "prior-month") {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return MONTHS[d.getMonth()];
  }
  return MONTHS[now.getMonth()];
}

/** Sort order: what needs you first, what is finished last. */
const STATUS_RANK: Record<ReminderStatus, number> = { overdue: 0, due: 1, "not-yet-due": 2, done: 3 };

/**
 * The reminders in the order they should be read.
 *
 * NOT most-recent-first. The card is asking "am I on top of these", and
 * recency is the opposite of that signal — newest-first puts what you just did
 * at the top and buries what you forgot at the bottom. Worst first, and within
 * a status the one untouched longest leads.
 */
export function sortByUrgency(
  reminders: ImportReminder[],
  lastAt: (r: ImportReminder) => string | undefined,
  now: Date,
): ImportReminder[] {
  return [...reminders].sort((a, b) => {
    const d = STATUS_RANK[reminderStatus(a, lastAt(a), now)] - STATUS_RANK[reminderStatus(b, lastAt(b), now)];
    if (d !== 0) return d;
    const at = (r: ImportReminder) => { const v = lastAt(r); const t = v ? new Date(v).getTime() : 0; return Number.isNaN(t) ? 0 : t; };
    return at(a) - at(b); // longest since it was last done, first
  });
}

/** Import reminders whose cadence makes them relevant in a given week —
 *  weeklies always, monthlies when the week contains the 1st. */
export function importsForWeek(weekStart: Date, weekEnd: Date): ImportReminder[] {
  const spansFirst = (() => {
    const d = new Date(weekStart);
    while (d <= weekEnd) { if (d.getDate() === 1) return true; d.setDate(d.getDate() + 1); }
    return false;
  })();
  return IMPORT_REMINDERS.filter((r) =>
    r.cadence === "weekly" || (r.cadence === "monthly" && spansFirst) || r.cadence === "quarterly" && spansFirst);
}
