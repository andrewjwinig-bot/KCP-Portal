// T-12 — the TRAILING TWELVE MONTHS of actuals, ending at a posted month.
//
// A property's GL is stored a calendar year at a time, so a T-12 ending August
// 2026 is Sep–Dec of the 2025 GL followed by Jan–Aug of the 2026 GL. This file
// is the pure half: which twelve months, and each account's twelve nets laid
// end to end in that order — so the Reprojections engine can run on them
// unchanged (every month an actual, nothing from the budget).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type T12Month = { year: number; month: number /* 1–12 */ };

/** The twelve months ending at `endMonth` of `endYear`, oldest first. */
export function t12Window(endYear: number, endMonth: number): T12Month[] {
  return Array.from({ length: 12 }, (_, i) => {
    const offset = endMonth - 12 + i; // months after Dec of endYear-1 … as 0-based from Jan endYear
    return offset < 0 ? { year: endYear - 1, month: offset + 13 } : { year: endYear, month: offset + 1 };
  });
}

/** Column headings: "Sep 25" … "Aug 26". */
export function t12Labels(win: T12Month[]): string[] {
  return win.map((m) => `${MONTHS[m.month - 1]} ${String(m.year).slice(2)}`);
}

/** "Sep 2025 – Aug 2026". */
export function t12Span(win: T12Month[]): string {
  const a = win[0], b = win[win.length - 1];
  return `${MONTHS[a.month - 1]} ${a.year} – ${MONTHS[b.month - 1]} ${b.year}`;
}

/** Each account's nets across the window, from the two calendar-year GLs. */
export function stitchMonthly(
  win: T12Month[],
  byYear: Record<number, Record<string, number[]> | null | undefined>,
): Record<string, number[]> {
  const accounts = new Set<string>();
  for (const y of new Set(win.map((m) => m.year))) for (const a of Object.keys(byYear[y] ?? {})) accounts.add(a);
  const out: Record<string, number[]> = {};
  for (const a of accounts) out[a] = win.map((m) => byYear[m.year]?.[a]?.[m.month - 1] ?? 0);
  return out;
}

/** The months in the window a GL does not cover — no upload for that year, or
 *  one that stops short of the month. Named, so the page can say which. */
export function missingMonths(win: T12Month[], coverage: Record<number, number>): T12Month[] {
  return win.filter((m) => !(m.month <= (coverage[m.year] ?? 0)));
}
