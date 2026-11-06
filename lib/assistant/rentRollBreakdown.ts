// Occupancy and rent per SF from the CURRENT RENT ROLL, grouped by property
// type, book or property (owner: "also make it handle occupancy and rent per
// SF by type"). Computed in code so the assistant quotes figures rather than
// dividing by hand. Pure; the agent route hands it the composed rent roll.
//
// Rent per SF is ANNUAL base rent ÷ OCCUPIED (paying) SF — the way a rent roll
// quotes it; dividing by total SF would make vacancy read as a lower rent.
// Gross adds the monthly CAM, RE tax and other charges. In-house amenity units
// (a training room, a gym) count as occupied SF, as the rent roll counts them,
// but carry no rent and are left out of the rent-per-SF denominator.

import type { RentRollProperty } from "../rentroll/parseRentRollExcel";
import { propertyTypeOf, bookOf, type BreakdownGroupBy } from "./breakdown";

export type RentRollGroup = {
  group: string;
  properties: number;
  totalSqft: number;
  occupiedSqft: number;
  vacantSqft: number;
  occupancyPct: number | null;
  units: number;
  vacantUnits: number;
  annualBaseRent: number;
  baseRentPerSf: number | null;
  annualGrossRent: number;
  grossRentPerSf: number | null;
  /** Share of the portfolio's total SF / base rent, in percent. */
  shareOfSqftPct: number | null;
  shareOfBaseRentPct: number | null;
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const psf = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) / 100 : null);

export function rentRollBreakdown(
  properties: RentRollProperty[],
  opts: { groupBy: BreakdownGroupBy; includeManagement?: boolean; names?: Record<string, string> },
): { groupBy: BreakdownGroupBy; groups: RentRollGroup[]; total: RentRollGroup } {
  const keyOf = (code: string) =>
    opts.groupBy === "property" ? `${code}${opts.names?.[code] ? ` ${opts.names[code]}` : ""}`
      : opts.groupBy === "book" ? bookOf(code)
      : propertyTypeOf(code);
  type Acc = { codes: Set<string>; total: number; occ: number; rentSf: number; units: number; vac: number; base: number; gross: number };
  const map = new Map<string, Acc>();
  const all: Acc = { codes: new Set(), total: 0, occ: 0, rentSf: 0, units: 0, vac: 0, base: 0, gross: 0 };
  for (const p of properties) {
    const code = p.propertyCode.toUpperCase();
    if (!opts.includeManagement && (code === "2000" || code === "2010")) continue;
    const k = keyOf(code);
    const a = map.get(k) ?? { codes: new Set(), total: 0, occ: 0, rentSf: 0, units: 0, vac: 0, base: 0, gross: 0 };
    for (const u of p.units ?? []) {
      const sf = u.sqft ?? 0;
      for (const t of [a, all]) {
        t.codes.add(code);
        t.units += 1;
        t.total += sf;
        if (u.isVacant) { t.vac += 1; continue; }
        t.occ += sf;
        if (u.amenity) continue;
        const base = (u.baseRent ?? 0) * 12;
        t.base += base;
        t.gross += base + ((u.opexMonth ?? 0) + (u.reTaxMonth ?? 0) + (u.otherMonth ?? 0)) * 12;
        if (base > 0) t.rentSf += sf;
      }
    }
    map.set(k, a);
  }
  const out = (group: string, a: Acc): RentRollGroup => ({
    group, properties: a.codes.size,
    totalSqft: Math.round(a.total), occupiedSqft: Math.round(a.occ), vacantSqft: Math.round(a.total - a.occ),
    occupancyPct: pct(a.occ, a.total), units: a.units, vacantUnits: a.vac,
    annualBaseRent: Math.round(a.base), baseRentPerSf: psf(a.base, a.rentSf),
    annualGrossRent: Math.round(a.gross), grossRentPerSf: psf(a.gross, a.rentSf),
    shareOfSqftPct: pct(a.total, all.total), shareOfBaseRentPct: pct(a.base, all.base),
  });
  const groups = [...map.entries()].filter(([, a]) => a.units > 0).map(([k, a]) => out(k, a))
    .sort((x, y) => y.totalSqft - x.totalSqft);
  return { groupBy: opts.groupBy, groups, total: out("Total", all) };
}
