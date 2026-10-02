// A short period label for the dashboard's status pills — "SEP", "JAN–JUN".
//
// The three things this labels record their period in three different ways,
// because each came from a different source: payroll as a pay DATE
// ("09/07/2026"), the credit-card batch as a statement RANGE ("Aug 03, 2026 to
// Aug 31, 2026"), the allocated run as a key ("2026-01_to_2026-06"). The pill
// wants one answer from any of them.
//
// IT RETURNS NULL RATHER THAN GUESSING. A pill reading the wrong month is
// worse than a pill reading "SAVED": the whole point of putting the period
// there is to be able to tell at a glance which month is done.

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** 1–12 → "JAN". Null for anything outside. */
const monthName = (m: number): string | null => (m >= 1 && m <= 12 ? MON[m - 1] : null);

/** Every month this text names, in the order they appear. */
function monthsIn(text: string): number[] {
  const out: number[] = [];
  const push = (m: number) => { if (m >= 1 && m <= 12) out.push(m); };

  // "2026-01", "2026-06" — an ISO-ish year-month key. Digit lookarounds, NOT
  // `\b`: the allocated run's key is "2026-01_to_2026-06" and `_` is a word
  // character, so a word boundary matches at neither end of the second half.
  for (const m of text.matchAll(/(?<!\d)(\d{4})[-/](\d{1,2})(?!\d)/g)) push(Number(m[2]));
  if (out.length) return out;

  // "09/07/2026", "8/3/26" — a US date.
  for (const m of text.matchAll(/\b(\d{1,2})[/](\d{1,2})[/](\d{2,4})\b/g)) push(Number(m[1]));
  if (out.length) return out;

  // "Aug 03, 2026 to Aug 31, 2026" — a spelled month.
  for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi)) {
    push(MON.indexOf(m[1].slice(0, 3).toUpperCase()) + 1);
  }
  return out;
}

/**
 * The pill's text, or null when the period cannot be read confidently.
 *
 * A single month reads "SEP"; a range reads "JAN–JUN". A range whose ends are
 * the same month collapses to that month, since a credit-card statement
 * running the 3rd to the 31st of August is an AUGUST statement, not a range.
 */
export function periodPill(text: string | null | undefined): string | null {
  if (!text) return null;
  const months = monthsIn(String(text));
  if (!months.length) return null;
  const first = monthName(months[0]);
  const last = monthName(months[months.length - 1]);
  if (!first || !last) return null;
  return first === last ? first : `${first}–${last}`;
}
