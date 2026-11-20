import { snapshotMonthKey } from "./snapshot";

// Trailing occupancy by GROUP of properties, read off the monthly rent-roll
// snapshots (`rentroll-history`). Each month takes every property from the
// latest snapshot AT OR BEFORE it — the same carry-forward rule as
// `composeCurrentRoll`, so an office-only import does not make a month read
// as if the retail properties were empty. A group with no snapshot that early
// is null for that month (never back-filled from a LATER roll), so a short
// history draws a short line rather than a flat invented one.

export type OccGroup = { label: string; codes: Set<string> };
export type OccPoint = { month: string; pct: Record<string, number | null> };

const code = (p: { propertyCode?: string }) => String(p?.propertyCode ?? "").toUpperCase();

/** The `n` months ending at `endMonth` ("YYYY-MM"), oldest first. */
export function trailingMonths(endMonth: string, n: number): string[] {
  const [y, m] = endMonth.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Occupied SF ÷ total SF per group, per month. */
export function occupancyTrend(
  snapshots: { properties?: any[]; reportTo?: string | null; uploadedAt?: string | null }[],
  endMonth: string,
  months: number,
  groups: OccGroup[],
): OccPoint[] {
  const keyed = snapshots
    .filter((s) => s && Array.isArray(s.properties))
    .map((s) => ({ key: snapshotMonthKey(s), props: s.properties as any[] }))
    .sort((a, b) => a.key.localeCompare(b.key));
  return trailingMonths(endMonth, months).map((month) => {
    // Each property from the newest snapshot at or before this month.
    const byCode = new Map<string, any>();
    for (const s of keyed) {
      if (s.key > month) break;
      for (const p of s.props) if (code(p)) byCode.set(code(p), p);
    }
    const pct: Record<string, number | null> = {};
    for (const g of groups) {
      let total = 0, occ = 0;
      for (const c of g.codes) {
        const p = byCode.get(c);
        if (!p) continue;
        let t = 0, o = 0;
        for (const u of p.units ?? []) {
          const sf = Number(u.sqft) || 0;
          t += sf;
          if (!u.isVacant) o += sf;
        }
        total += Number(p.totalSqft) || t;
        occ += o;
      }
      pct[g.label] = total > 0 ? (occ / total) * 100 : null;
    }
    return { month, pct };
  });
}
