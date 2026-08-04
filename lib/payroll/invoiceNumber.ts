// Payroll invoice numbering.
//
// Format: PR<propertyCode><MM><YY><payPeriod>
//   e.g. property 3610, pay date 5/8/2026 (1st payroll of May) → "PR361005261"
//
// payPeriod is which biweekly payday of the month the pay date falls on (1, 2,
// or 3), derived from the same payday cadence the dashboard uses.

// A known biweekly payday (a Friday). Paydays are every 14 days from here.
const ANCHOR_UTC = Date.UTC(2026, 4, 8); // 2026-05-08
const DAY = 86_400_000;

/** Parse a pay-date string (M/D/YYYY or YYYY-MM-DD) to a Date, or null. */
export function parsePayDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Which payday of its month a date is (1, 2, or 3), by the biweekly cadence. */
export function payPeriodOfMonth(d: Date): number {
  const t = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const k = Math.round((t - ANCHOR_UTC) / (14 * DAY)); // payday index vs anchor
  let count = 1;
  for (let prev = k - 1; ; prev--) {
    const pd = new Date(ANCHOR_UTC + prev * 14 * DAY);
    if (pd.getUTCMonth() === d.getMonth() && pd.getUTCFullYear() === d.getFullYear()) count++;
    else break;
  }
  return count;
}

/** Build the payroll invoice number for a property + pay date. */
export function payrollInvoiceNumber(
  invoice: { propertyCode?: string | null; propertyKey?: string | null },
  payDate: string | null | undefined,
): string {
  const code = String(invoice.propertyCode || invoice.propertyKey || "").replace(/[^A-Za-z0-9]/g, "");
  const d = parsePayDate(payDate);
  if (!d) return `PR${code}`;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  return `PR${code}${mm}${yy}${payPeriodOfMonth(d)}`;
}
