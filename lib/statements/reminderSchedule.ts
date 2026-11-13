// The monthly tenant notice calendar (owner, 11/2026):
//
//   the 15th        — Drew re-imports the Credit Balance Report; the import
//                     builds the month's notices and emails Greg to approve
//                     them ("allow enough time for tenants to apply their
//                     credits/pay their charges before the next months
//                     statement goes out")
//   the 25th        — statements go out
//   the business day before the 25th
//                   — Drew and Tami get every credit a tenant asked us to
//                     apply, so none is missed on the statements
//
// Pure and client-safe. Dates are Eastern calendar dates, YYYY-MM-DD.

export const NOTICE_DAY = 15;
export const STATEMENT_DAY = 25;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Today in Eastern time, YYYY-MM-DD. */
export function etToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** The month after `ym` (YYYY-MM). */
export function nextMonthOf(ym: string): string {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/** Thanksgiving and the day after — the only office holidays that can fall
 *  on the business day before the 25th (Nov 22–28). */
function holidays(y: number): Set<string> {
  const nov1 = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const thanks = 1 + ((4 - nov1 + 7) % 7) + 21;
  return new Set([ymd(y, 11, thanks), ymd(y, 11, thanks + 1), ymd(y, 12, 24), ymd(y, 12, 25)]);
}

export function isBusinessDay(iso: string): boolean {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = d.getUTCDay();
  return dow !== 0 && dow !== 6 && !holidays(d.getUTCFullYear()).has(iso);
}

/** The business day before the 25th of `ym` — when the credit summary goes. */
export function creditSummaryDay(ym: string): string {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1, STATEMENT_DAY));
  do d.setUTCDate(d.getUTCDate() - 1); while (!isBusinessDay(d.toISOString().slice(0, 10)));
  return d.toISOString().slice(0, 10);
}

/** The last day a tenant can ask us to apply a credit for `ym`'s notice: the
 *  day before statements go out. */
export function applyDeadline(ym: string): string {
  return ymd(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), STATEMENT_DAY - 1);
}
