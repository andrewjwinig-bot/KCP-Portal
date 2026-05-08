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

export type GroupTotals = { total: number; occupied: number; vacant: number; pct: number };

export type RentRollSnapshotSummary = {
  month: string;             // "YYYY-MM" key
  reportFrom: string | null;
  reportTo: string | null;
  uploadedAt: string;
  totals: Record<GroupKey, GroupTotals>;
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

function tally(props: RentRollProperty[]): GroupTotals {
  const total    = props.reduce((s, p) => s + p.totalSqft,    0);
  const occupied = props.reduce((s, p) => s + p.occupiedSqft, 0);
  const vacant   = total - occupied;
  const pct      = total > 0 ? (occupied / total) * 100 : 0;
  return { total, occupied, vacant, pct };
}

export function computeGroupTotals(rentroll: RentRollData): Record<GroupKey, GroupTotals> {
  const out: Record<string, GroupTotals> = {};
  for (const g of TREND_GROUPS) {
    const props = g.codes
      ? rentroll.properties.filter((p) => g.codes!.has(p.propertyCode.toUpperCase()))
      : rentroll.properties;
    out[g.key] = tally(props);
  }
  return out;
}

export function summarizeSnapshot(rentroll: RentRollData): RentRollSnapshotSummary {
  return {
    month: snapshotMonthKey(rentroll),
    reportFrom: rentroll.reportFrom ?? null,
    reportTo: rentroll.reportTo ?? null,
    uploadedAt: rentroll.uploadedAt,
    totals: computeGroupTotals(rentroll),
  };
}
