import type { RentRollData, RentRollProperty } from "./parseRentRollExcel";

const JV_III_CODES = new Set(["3610", "3620", "3640"]);
const NI_LLC_CODES = new Set(["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
const SC_CODES     = new Set(["1100", "2300", "4500", "7010", "9510", "7200", "7300", "1500", "9200", "5600", "8200"]);
const KH_CODES     = new Set(["9800", "9820", "9840", "9860"]);

export const TREND_GROUPS: { key: string; label: string; codes: Set<string> | null }[] = [
  { key: "total",     label: "Total",            codes: null },
  { key: "jv3",       label: "JV III LLC",       codes: JV_III_CODES },
  { key: "ni",        label: "NI LLC",           codes: NI_LLC_CODES },
  { key: "sc",        label: "Shopping Centers", codes: SC_CODES },
  { key: "kh",        label: "Korman Homes",     codes: KH_CODES },
];

export type GroupKey = (typeof TREND_GROUPS)[number]["key"];

export type GroupTotals = {
  total: number;
  occupied: number;
  vacant: number;
  pct: number;
  /** Total monthly gross rent (base + CAM + RET + other) summed across occupied units. */
  grossRentMonth: number;
  /** Annualized gross rent ÷ occupied SF; 0 when no occupied SF. */
  avgRentPsf: number;
  unitCount: number;
  occupiedUnitCount: number;
  vacantUnitCount: number;
  /** Count of units whose lease expires within 90 / 180 / 365 days from
   *  the snapshot's reportTo date (or upload date as fallback). */
  expiring90: number;
  expiring180: number;
  expiring365: number;
};

export type PropertyTotals = {
  propertyCode: string;
  total: number;
  occupied: number;
  vacant: number;
  pct: number;
  grossRentMonth: number;
};

export type RentRollSnapshotSummary = {
  month: string;             // "YYYY-MM" key
  reportFrom: string | null;
  reportTo: string | null;
  uploadedAt: string;
  totals: Record<GroupKey, GroupTotals>;
  /** Per-property totals so the trends page can render small multiples. */
  byProperty: PropertyTotals[];
};

export function snapshotMonthKey(rentroll: { reportTo?: string | null; uploadedAt?: string | null }): string {
  const r = rentroll.reportTo;
  if (r) {
    const m = r.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[1].padStart(2, "0")}`;
    const d = new Date(r);
    if (!isNaN(d.getTime())) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  const u = rentroll.uploadedAt ? new Date(rentroll.uploadedAt) : new Date();
  return `${u.getFullYear()}-${String(u.getMonth() + 1).padStart(2, "0")}`;
}

function parseUSDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

function snapshotAnchorDate(r: RentRollData): Date {
  return parseUSDate(r.reportTo ?? null) ?? new Date(r.uploadedAt ?? Date.now());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function tally(props: RentRollProperty[], anchor: Date): GroupTotals {
  const total    = props.reduce((s, p) => s + p.totalSqft,    0);
  const occupied = props.reduce((s, p) => s + p.occupiedSqft, 0);
  const vacant   = total - occupied;
  const pct      = total > 0 ? (occupied / total) * 100 : 0;
  let grossRentMonth = 0;
  let unitCount = 0;
  let occupiedUnitCount = 0;
  let vacantUnitCount = 0;
  let expiring90 = 0, expiring180 = 0, expiring365 = 0;
  for (const p of props) {
    for (const u of p.units) {
      unitCount += 1;
      if (u.isVacant) {
        vacantUnitCount += 1;
        continue;
      }
      occupiedUnitCount += 1;
      grossRentMonth += u.grossRentTotal;
      const lt = parseUSDate(u.leaseTo);
      if (!lt) continue;
      const days = daysBetween(anchor, lt);
      if (days >= 0 && days <= 365) {
        expiring365 += 1;
        if (days <= 180) expiring180 += 1;
        if (days <= 90) expiring90 += 1;
      }
    }
  }
  const annualGross = grossRentMonth * 12;
  const avgRentPsf = occupied > 0 ? annualGross / occupied : 0;
  return {
    total, occupied, vacant, pct,
    grossRentMonth, avgRentPsf,
    unitCount, occupiedUnitCount, vacantUnitCount,
    expiring90, expiring180, expiring365,
  };
}

export function computeGroupTotals(rentroll: RentRollData): Record<GroupKey, GroupTotals> {
  const anchor = snapshotAnchorDate(rentroll);
  const out: Record<string, GroupTotals> = {};
  for (const g of TREND_GROUPS) {
    const props = g.codes
      ? rentroll.properties.filter((p) => g.codes!.has(p.propertyCode.toUpperCase()))
      : rentroll.properties;
    out[g.key] = tally(props, anchor);
  }
  return out;
}

function tallyOne(p: RentRollProperty): PropertyTotals {
  const grossRentMonth = p.units.reduce((s, u) => s + (u.isVacant ? 0 : u.grossRentTotal), 0);
  const total = p.totalSqft;
  const occupied = p.occupiedSqft;
  const vacant = p.vacantSqft;
  const pct = total > 0 ? (occupied / total) * 100 : 0;
  return { propertyCode: p.propertyCode, total, occupied, vacant, pct, grossRentMonth };
}

export function summarizeSnapshot(rentroll: RentRollData): RentRollSnapshotSummary {
  return {
    month: snapshotMonthKey(rentroll),
    reportFrom: rentroll.reportFrom ?? null,
    reportTo: rentroll.reportTo ?? null,
    uploadedAt: rentroll.uploadedAt,
    totals: computeGroupTotals(rentroll),
    byProperty: rentroll.properties.map(tallyOne),
  };
}
