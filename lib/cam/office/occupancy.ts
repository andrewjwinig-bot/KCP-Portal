// Partial-year occupancy for office CAM/RET reconciliation.
//
// A tenant reconciles only for the portion of the year it occupied the
// suite. The CAM workbook computes "% Occ" on a 365-day year as the count
// of days the lease overlapped the reconciliation year ÷ 365 (inclusive of
// both endpoints), e.g. a lease running through 6/30/2025 → 181/365.
//
// Lease dates arrive from the rent roll as "M/D/YYYY" strings.

/** Parse an "M/D/YYYY" (or "MM/DD/YYYY") date to a UTC Date, or null. */
function parseUSDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
}

function dayNumber(d: Date): number {
  return Math.floor(d.getTime() / 86400000);
}

/**
 * Fraction of `year` (0–1) the lease [leaseFrom, leaseTo] was in effect,
 * on a 365-day basis. A full year → 1. A lease that doesn't overlap the
 * year → 0. Missing leaseFrom is treated as "in place since before the
 * year"; missing leaseTo as "open-ended" (full year through Dec 31).
 */
export function occupancyPctForYear(
  leaseFrom: string | null | undefined,
  leaseTo: string | null | undefined,
  year: number,
): number {
  const yearStart = Date.UTC(year, 0, 1);
  const yearEnd = Date.UTC(year, 11, 31);

  const fromD = parseUSDate(leaseFrom);
  const toD = parseUSDate(leaseTo);

  const start = fromD ? Math.max(fromD.getTime(), yearStart) : yearStart;
  const end = toD ? Math.min(toD.getTime(), yearEnd) : yearEnd;
  if (end < start) return 0;

  // Inclusive day count, matching the workbook's 365-day convention.
  const days = dayNumber(new Date(end)) - dayNumber(new Date(start)) + 1;
  return days / 365;
}
