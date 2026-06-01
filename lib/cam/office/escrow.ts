// Escrow — the CAM/RET a tenant actually paid in estimates during the
// reconciliation year, which nets against its reconciled amount due.
//
// Two ways to arrive at it, per the agreed rule:
//
//   1. Annualized estimate (default until a full year of monthly rent rolls
//      exists): the current monthly CAM/RET charge × the number of months
//      the tenant occupied the suite that year. e.g. $350/mo × 6 months in
//      place = $2,100.
//
//   2. Summed actuals (once 12 monthly snapshots exist): add up each month's
//      charge over the occupied months, so a mid-year rate change is
//      captured exactly.
//
// Both are just defaults — the escrow is editable per tenant at recon time.

function parseUSDate(s: string | null | undefined): { y: number; m: number } | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return { y: Number(m[3]), m: Number(m[1]) }; // 1-based month
}

/**
 * Number of calendar months in `year` the lease [leaseFrom, leaseTo] was in
 * place (1–12). A month the lease touched at all counts as occupied/billed.
 * Missing leaseFrom → in place since before the year; missing leaseTo →
 * open-ended through December.
 */
export function monthsOccupiedInYear(
  leaseFrom: string | null | undefined,
  leaseTo: string | null | undefined,
  year: number,
): number {
  const from = parseUSDate(leaseFrom);
  const to = parseUSDate(leaseTo);

  // Start month within the year (clamped to January).
  let startMonth = 1;
  if (from) {
    if (from.y > year) return 0;
    if (from.y === year) startMonth = from.m;
  }
  // End month within the year (clamped to December).
  let endMonth = 12;
  if (to) {
    if (to.y < year) return 0;
    if (to.y === year) endMonth = to.m;
  }
  if (endMonth < startMonth) return 0;
  return endMonth - startMonth + 1;
}

/** Annualized estimate: monthly charge × months occupied. */
export function annualizedEscrow(monthlyCharge: number, monthsOccupied: number): number {
  return Math.round(monthlyCharge * monthsOccupied * 100) / 100;
}

/** Summed actuals: total of each month's charge (sparse/short arrays ok). */
export function escrowFromMonthlyCharges(charges: Array<number | null | undefined>): number {
  const total = charges.reduce<number>((s, c) => s + (Number(c) || 0), 0);
  return Math.round(total * 100) / 100;
}
