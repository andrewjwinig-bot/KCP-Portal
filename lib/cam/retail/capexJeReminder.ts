// THE YEARLY JOURNAL-ENTRY REMINDER for an amortized CAM capital project
// (owner, 11/2026: "send an email december 1st … to make the journal entry for
// the 2300 capitalized CAM project … an annual reminder for the length of the
// amortization schedule to not forget"). Each entry in CAPEX_AMORTIZATIONS
// carrying a `jeReminder` is emailed on its date (Eastern) every year from
// `firstYear` through `lastYear`, once a year — a missed day is caught up later
// that same month, never carried into the next. Pure: what is due and what it
// says. The send is capexJeReminderSend.ts.

import { CAPEX_AMORTIZATIONS, capexAmountIn, type CapexAmortization } from "./capex";
import { portalEmail } from "@/lib/email/portalEmail";

export type JeReminderDue = { capex: CapexAmortization; year: number; key: string };

/** Today in Eastern time as [year, month, day]. */
export function easternDate(now: Date): [number, number, number] {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(now);
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return [n("year"), n("month"), n("day")];
}

export const reminderKey = (c: CapexAmortization, year: number) => `${c.property}-${year}`;

/** The reminders due on `now` (Eastern) that `sent` does not already hold. */
export function remindersDue(now: Date, sent: Set<string>, list: CapexAmortization[] = CAPEX_AMORTIZATIONS): JeReminderDue[] {
  const [y, m, d] = easternDate(now);
  return list.flatMap((c) => {
    const r = c.jeReminder;
    if (!r || c.firstYear == null || c.lastYear == null) return [];
    if (y < c.firstYear || y > c.lastYear) return [];
    if (m !== r.month || d < r.day) return [];
    const key = reminderKey(c, y);
    return sent.has(key) ? [] : [{ capex: c, year: y, key }];
  });
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function reminderEmail(c: CapexAmortization, year: number) {
  const first = c.firstYear ?? year;
  const last = c.lastYear ?? year;
  const n = last - first + 1;
  const i = year - first + 1;
  const amount = capexAmountIn(c, year);
  const left = Array.from({ length: Math.max(0, last - year) }, (_, k) => year + 1 + k);
  const when = c.jeReminder ? `${MONTHS[c.jeReminder.month - 1]} ${c.jeReminder.day}` : "year";
  return portalEmail({
    subject: `Reminder: ${year} journal entry for ${c.property} ${c.label}`,
    eyebrow: "Annual Journal Entry",
    title: `Book ${c.property}'s ${year} capitalized CAM amortization`,
    figure: { value: money(amount), label: `${year} amortization · year ${i} of ${n}` },
    lead: `Make the ${year} journal entry for ${c.property}'s ${c.label}, the capitalized CAM project recovered from tenants.`,
    rows: [
      { label: "Property", value: c.property, code: true },
      { label: "CAM line", value: c.label },
      ...(c.project ? [{ label: "Project", value: c.project }] : []),
      { label: `${year} amount`, value: money(amount) },
      { label: "Schedule", value: `${first}–${last} (${n} years)` },
      { label: "Still to come", value: left.length ? left.join(", ") : "None — this is the last year" },
    ],
    ...(c.note ? { note: { label: "Who shares it", text: c.note } } : {}),
    link: { label: "Open the CAM Reconciliation", path: `/cam-recon?property=${c.property}` },
    footer: `This reminder comes every ${when} through ${last}.`,
  });
}
