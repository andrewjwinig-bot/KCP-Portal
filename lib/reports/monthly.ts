// Master Monthly Review — assembles a company-wide snapshot across leasing,
// operations, and financials for a given month, grouped Business Parks /
// Shopping Centers / LIK / Other. Numbers are computed here; the report page
// only renders them (with optional AI narrative layered on top).

import "server-only";
import { getJSON, listJSON } from "@/lib/storage";
import type { RentRollData } from "@/lib/rentroll/parseRentRollExcel";
import { listRequests } from "@/lib/maintenance/requestsStorage";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { listFullGls, type StoredGl } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { summaryForPeriod } from "@/lib/financials/operating-statements/glParser";
import { computeStatement } from "@/lib/financials/operating-statements/compute";
import { resolvePropertyBudget, makeBudgetLookup } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { PROPERTY_DEFS } from "@/lib/properties/data";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const HISTORY_PREFIX = "rentroll-history";

// Company groupings for the report.
const BUSINESS_PARKS = new Set(["3610", "3620", "3640", "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
const SHOPPING_CENTERS = new Set(["1100", "2300", "4500", "7010", "9510", "7200", "7300", "1500", "9200", "5600", "8200"]);
const LIK = new Set(["2000", "2010"]);
export const REPORT_GROUP_ORDER = ["bp", "sc", "lik", "other"] as const;
export type ReportGroupKey = (typeof REPORT_GROUP_ORDER)[number];
export const REPORT_GROUP_LABELS: Record<ReportGroupKey, string> = {
  bp: "Business Parks", sc: "Shopping Centers", lik: "LIK", other: "Other",
};
function groupOf(code: string): ReportGroupKey {
  const c = code.toUpperCase();
  if (BUSINESS_PARKS.has(c)) return "bp";
  if (SHOPPING_CENTERS.has(c)) return "sc";
  if (LIK.has(c)) return "lik";
  return "other";
}

export type GroupMetrics = {
  key: ReportGroupKey; label: string;
  totalSqft: number; occupiedSqft: number; vacantSqft: number; occPct: number;
  units: number; vacantUnits: number;
  noiActual: number | null; noiBudget: number | null;
  openRequests: number;
  newLeases: number; vacated: number;
};

export type LeaseChange = { propertyCode: string; group: ReportGroupKey; unitRef: string; tenant: string; sqft: number };
export type Expiration = { propertyCode: string; group: ReportGroupKey; unitRef: string; tenant: string; sqft: number; leaseTo: string; days: number };

export type MonthlyReport = {
  year: number; month: number; monthLabel: string; generatedAt: string;
  rentRollMonth: string | null;
  portfolio: {
    totalSqft: number; occupiedSqft: number; vacantSqft: number; occPct: number;
    occPctPrior: number | null; units: number; vacantUnits: number;
    noiActual: number | null; noiBudget: number | null;
    openRequests: number; completedThisMonth: number; newRequestsThisMonth: number;
  };
  groups: GroupMetrics[];
  newLeases: LeaseChange[]; vacated: LeaseChange[]; expirations: Expiration[];
  requestsByPriority: { priority: string; count: number }[];
  upcoming: { label: string; when: string; kind: "deadline" | "seasonal" }[];
};

function monthKeyOf(r: { reportTo?: string | null; uploadedAt?: string | null }): string {
  const m = (r.reportTo ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}`;
  const d = r.uploadedAt ? new Date(r.uploadedAt) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
function parseUSDate(s: string | null | undefined): Date | null {
  const m = (s ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])) : null;
}

/** Occupied (non-vacant, non-amenity, named) units of a snapshot, by unitRef. */
function occupiedUnits(r: RentRollData): Map<string, { occupantName: string; sqft: number; propertyCode: string; leaseTo: string | null }> {
  const map = new Map<string, { occupantName: string; sqft: number; propertyCode: string; leaseTo: string | null }>();
  for (const p of r.properties ?? []) for (const u of p.units ?? []) {
    if (u.isVacant || u.amenity || !u.occupantName) continue;
    map.set(u.unitRef, { occupantName: u.occupantName, sqft: u.sqft ?? 0, propertyCode: p.propertyCode, leaseTo: u.leaseTo });
  }
  return map;
}

export async function buildMonthlyReport(year: number, month: number, now: Date): Promise<MonthlyReport> {
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  // Rent roll for the month (fall back to current if that month isn't stored).
  const history = ((await listJSON(HISTORY_PREFIX)) as RentRollData[]) ?? [];
  const byKey = new Map(history.map((h) => [monthKeyOf(h), h]));
  const roll = byKey.get(monthKey) ?? ((await getJSON("rentroll", "current")) as RentRollData | null);
  const rentRollMonth = roll ? monthKeyOf(roll) : null;

  // Prior month (for occupancy MoM + leasing diff).
  const priorKeys = [...byKey.keys()].filter((k) => k < (rentRollMonth ?? monthKey)).sort();
  const prior = priorKeys.length ? byKey.get(priorKeys[priorKeys.length - 1]) ?? null : null;

  // ── Occupancy + SF by group (and portfolio) ──
  const g = (k: ReportGroupKey): GroupMetrics => ({
    key: k, label: REPORT_GROUP_LABELS[k], totalSqft: 0, occupiedSqft: 0, vacantSqft: 0, occPct: 0,
    units: 0, vacantUnits: 0, noiActual: null, noiBudget: null, openRequests: 0, newLeases: 0, vacated: 0,
  });
  const groups: Record<ReportGroupKey, GroupMetrics> = { bp: g("bp"), sc: g("sc"), lik: g("lik"), other: g("other") };
  let pTotal = 0, pOcc = 0, pVac = 0, pUnits = 0, pVacUnits = 0;
  if (roll) {
    for (const prop of roll.properties ?? []) {
      const gk = groupOf(prop.propertyCode);
      for (const u of prop.units ?? []) {
        if (u.amenity) continue;
        const sf = u.sqft ?? 0;
        groups[gk].totalSqft += sf; groups[gk].units += 1; pTotal += sf; pUnits += 1;
        if (u.isVacant) { groups[gk].vacantSqft += sf; groups[gk].vacantUnits += 1; pVac += sf; pVacUnits += 1; }
        else { groups[gk].occupiedSqft += sf; pOcc += sf; }
      }
    }
  }
  for (const k of REPORT_GROUP_ORDER) groups[k].occPct = groups[k].totalSqft > 0 ? (groups[k].occupiedSqft / groups[k].totalSqft) * 100 : 0;
  const occPct = pTotal > 0 ? (pOcc / pTotal) * 100 : 0;
  let occPctPrior: number | null = null;
  if (prior) {
    let t = 0, o = 0;
    for (const prop of prior.properties ?? []) for (const u of prop.units ?? []) { if (u.amenity) continue; const sf = u.sqft ?? 0; t += sf; if (!u.isVacant) o += sf; }
    occPctPrior = t > 0 ? (o / t) * 100 : null;
  }

  // ── Leasing diff (new leases / vacated) vs prior month ──
  const newLeases: LeaseChange[] = [], vacated: LeaseChange[] = [];
  if (roll && prior) {
    const nowOcc = occupiedUnits(roll), wasOcc = occupiedUnits(prior);
    for (const [ref, u] of nowOcc) {
      const b = wasOcc.get(ref);
      if (!b || norm(b.occupantName) !== norm(u.occupantName)) newLeases.push({ propertyCode: u.propertyCode, group: groupOf(u.propertyCode), unitRef: ref, tenant: u.occupantName, sqft: u.sqft });
    }
    for (const [ref, u] of wasOcc) {
      const a = nowOcc.get(ref);
      if (!a || norm(a.occupantName) !== norm(u.occupantName)) vacated.push({ propertyCode: u.propertyCode, group: groupOf(u.propertyCode), unitRef: ref, tenant: u.occupantName, sqft: u.sqft });
    }
  }
  for (const l of newLeases) groups[l.group].newLeases += 1;
  for (const l of vacated) groups[l.group].vacated += 1;

  // ── Expirations in the next 90 days ──
  const expirations: Expiration[] = [];
  if (roll) {
    for (const prop of roll.properties ?? []) for (const u of prop.units ?? []) {
      if (u.isVacant || u.amenity || !u.occupantName || !u.leaseTo) continue;
      const d = parseUSDate(u.leaseTo); if (!d) continue;
      const days = Math.round((d.getTime() - now.getTime()) / 86400000);
      if (days >= -30 && days <= 90) expirations.push({ propertyCode: prop.propertyCode, group: groupOf(prop.propertyCode), unitRef: u.unitRef, tenant: u.occupantName, sqft: u.sqft ?? 0, leaseTo: u.leaseTo, days });
    }
    expirations.sort((a, b) => a.days - b.days);
  }

  // ── Service requests ──
  let openRequests = 0, completedThisMonth = 0, newRequestsThisMonth = 0;
  const priCount: Record<string, number> = {};
  try {
    const requests = await listRequests();
    for (const req of requests) {
      const gk = req.propertyCode ? groupOf(req.propertyCode) : "other";
      const open = req.status !== "Complete";
      if (open) { openRequests += 1; groups[gk].openRequests += 1; priCount[req.priority] = (priCount[req.priority] ?? 0) + 1; }
      const created = new Date(req.createdAt);
      if (!Number.isNaN(created.getTime()) && created.getFullYear() === year && created.getMonth() + 1 === month) newRequestsThisMonth += 1;
      const done = (req as { completedDate?: string }).completedDate;
      if (done) { const dd = new Date(done); if (!Number.isNaN(dd.getTime()) && dd.getFullYear() === year && dd.getMonth() + 1 === month) completedThisMonth += 1; }
    }
  } catch { /* best-effort */ }
  const requestsByPriority = Object.entries(priCount).map(([priority, count]) => ({ priority, count })).sort((a, b) => b.count - a.count);

  // ── NOI vs budget per group (best-effort; skip properties that error) ──
  let pNoiA: number | null = null, pNoiB: number | null = null;
  try {
    const [mappings, fulls] = await Promise.all([availableStatements(), listFullGls()]);
    const byKeyYear = new Map<string, StoredGl[]>();
    for (const gl of fulls) if (gl.year === year) { const a = byKeyYear.get(gl.key) ?? []; a.push(gl); byKeyYear.set(gl.key, a); }
    for (const m of mappings) {
      try {
        const stored = assembleGls(byKeyYear.get(m.key) ?? []);
        if (!stored) continue;
        const period = Math.min(month, stored.maxPeriodInFile);
        if (period < 1) continue;
        const mapping = await getMapping(m.key);
        if (!mapping) continue;
        const glSum = summaryForPeriod(stored.monthly, period);
        const budget = await resolvePropertyBudget(m.propertyCode, year);
        const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
        const st = computeStatement({ mapping, propertyName: mapping.entityName, year, period, gl: glSum, budgetLookup });
        const noi = st.rollups.netOperatingIncome;
        const gk = groupOf(m.propertyCode);
        groups[gk].noiActual = (groups[gk].noiActual ?? 0) + noi.ytdActual;
        if (noi.ytdBudget != null) groups[gk].noiBudget = (groups[gk].noiBudget ?? 0) + noi.ytdBudget;
        pNoiA = (pNoiA ?? 0) + noi.ytdActual;
        if (noi.ytdBudget != null) pNoiB = (pNoiB ?? 0) + noi.ytdBudget;
      } catch { /* skip this property */ }
    }
  } catch { /* no financials */ }

  // ── Upcoming / seasonal deadline guide ──
  const upcoming = seasonalGuide(now);

  return {
    year, month, monthLabel: `${MONTHS[month - 1]} ${year}`, generatedAt: now.toISOString(),
    rentRollMonth,
    portfolio: {
      totalSqft: pTotal, occupiedSqft: pOcc, vacantSqft: pVac, occPct, occPctPrior,
      units: pUnits, vacantUnits: pVacUnits, noiActual: pNoiA, noiBudget: pNoiB,
      openRequests, completedThisMonth, newRequestsThisMonth,
    },
    groups: REPORT_GROUP_ORDER.map((k) => groups[k]),
    newLeases, vacated, expirations,
    requestsByPriority,
    upcoming,
  };
}

// Seasonal deadline guide — the recurring big-rock dates so the report doubles
// as a "what's coming" agenda. Surfaced when within ~75 days.
function seasonalGuide(now: Date): { label: string; when: string; kind: "deadline" | "seasonal" }[] {
  const y = now.getFullYear();
  const items: { date: Date; label: string; kind: "deadline" | "seasonal" }[] = [
    { date: new Date(y, 2, 31), label: "CAM/RET reconciliations — prior year", kind: "seasonal" },
    { date: new Date(y, 5, 30), label: "Mid-year reprojections", kind: "seasonal" },
    { date: new Date(y, 8, 30), label: "Operating budgets — build for next year", kind: "seasonal" },
    { date: new Date(y, 10, 30), label: "Budgets finalized + tenant estimates", kind: "seasonal" },
    { date: new Date(y, 11, 31), label: "Insurance renewals / year-end close prep", kind: "seasonal" },
    { date: new Date(y + 1, 2, 31), label: "CAM/RET reconciliations — this year", kind: "seasonal" },
  ];
  return items
    .map((i) => ({ ...i, days: Math.round((i.date.getTime() - now.getTime()) / 86400000) }))
    .filter((i) => i.days >= -10 && i.days <= 75)
    .sort((a, b) => a.days - b.days)
    .map((i) => ({ label: i.label, when: i.date.toLocaleDateString("en-US", { month: "long", day: "numeric" }), kind: i.kind }));
}
