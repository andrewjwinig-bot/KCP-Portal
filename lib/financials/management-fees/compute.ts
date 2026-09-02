// Management Fees — pulled straight from the posted GL (account 6610, all
// cost-center suffixes) per building, compared to budget. No hand-keying: once a
// building's month is posted, its management fee is in the GL and shows here.
//
// Budget is shown two ways ("both, side by side"): bottom-up (each building's
// budgeted 6610 line, summed) and the top-down LIK Management (2010) plan — its
// Total Revenues rollup, which is the fee income the management company budgets
// to earn. The two should roughly tie.

import "server-only";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { listFullGls } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { lineMonthly } from "@/lib/financials/operating-statements/lineSeries";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import { resolvePropertyBudget } from "@/lib/financials/operating-statements/budgetCrosswalk";
import { loadFullYearStatement } from "@/lib/financials/operating-statements/fullYear";
import { listBudgets } from "@/lib/financials/budgets/storage";
import { assembledGl } from "@/lib/financials/operating-statements/statementStore";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { groupOf, REPORT_GROUP_ORDER, REPORT_GROUP_LABELS, type ReportGroupKey } from "@/lib/reports/monthly";

// Management fee is account 6610 (cost-center suffixes -8501/-8502/-8506…); the
// mask "6610" matches every suffix, which is what the total fee should be.
const MGMT_FEE_MASK = "6610";

const propName = (code: string) => PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase())?.name ?? code;
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);

export type MgmtFeeBuilding = {
  code: string;
  key: string;
  name: string;
  group: ReportGroupKey;
  groupLabel: string;
  /** 12 monthly management-fee actuals (Jan–Dec) from the GL. */
  feeMonthly: number[];
  /** 12 monthly budgeted management fee (the building's 6610 budget line). */
  budgetMonthly: number[];
  ytdActual: number;
  ytdBudget: number;
  annualBudget: number;
  /** Latest month posted to this building's GL (0 = none yet). */
  maxPosted: number;
  hasGl: boolean;
  budgetFallback: boolean;
};

export type MgmtFeeData = {
  year: number;
  months: string[]; // "Jan"…"Dec"
  buildings: MgmtFeeBuilding[];
  groups: { key: ReportGroupKey; label: string; codes: string[] }[];
  portfolio: {
    actualMonthly: number[];
    budgetBottomUpMonthly: number[];
    likPlanMonthly: number[] | null;
    ytdActual: number;
    ytdBudgetBottomUp: number;
    annualBudgetBottomUp: number;
    likPlanYtd: number | null;
    likPlanAnnual: number | null;
  };
  /** Latest month all GL-bearing buildings have posted (complete portfolio data). */
  completeThrough: number;
  likPlan: { budgetYear: number; fallback: boolean } | null;
  budgetFallback: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Sum every budget line whose GL account matches `mask`, month by month. Budget
 *  months are in display orientation (expense positive), so 6610 reads positive. */
function budgetMonthsForMask(lines: { glAccount: string; months: number[] }[], mask: string): number[] {
  const out = new Array(12).fill(0);
  for (const l of lines) {
    if (!accountMatchesMask(mask, l.glAccount)) continue;
    for (let m = 0; m < 12; m++) out[m] += l.months[m] ?? 0;
  }
  return out.map((n) => Math.round(n));
}

/** The LIK Management (2010) plan for the year: its budget's Total Revenues
 *  rollup = the fee income the management company budgets to earn. Falls back to
 *  the nearest budget year. */
async function likManagementPlan(year: number, workbooks: Awaited<ReturnType<typeof listBudgets>>): Promise<{ months: number[]; total: number; budgetYear: number; fallback: boolean } | null> {
  const byYear = new Map<number, { name: string; total: number; months: number[] }[]>();
  for (const wb of workbooks) {
    const prop = wb.properties.find((p) => String(p.propertyCode) === "2010");
    if (prop) byYear.set(wb.year, prop.rollups);
  }
  if (!byYear.size) return null;
  const yr = byYear.has(year) ? year : [...byYear.keys()].sort((a, b) => b - a)[0];
  const rollups = byYear.get(yr)!;
  const rev = rollups.find((r) => /total revenue/i.test(r.name));
  if (!rev || !Array.isArray(rev.months)) return null;
  return { months: rev.months.map((n) => Math.round(n)), total: Math.round(rev.total), budgetYear: yr, fallback: yr !== year };
}

/** Full management-fee dataset for a year: per-building actuals + budgets and the
 *  portfolio rollup with both budget bases. */
export async function loadManagementFees(year: number): Promise<MgmtFeeData> {
  const [mappings, fulls, workbooks] = await Promise.all([availableStatements(), listFullGls(), listBudgets()]);

  const buildings: MgmtFeeBuilding[] = [];
  for (const m of mappings) {
    const code = m.propertyCode;
    // The management company (LIK 2000/2010) earns the fees — it's the budget
    // source, not a fee-paying building.
    if (groupOf(code) === "lik") continue;

    const stored = assembleGls(fulls.filter((g) => g.key === m.key && g.year === year));
    const feeMonthly = stored ? lineMonthly(stored.monthly, MGMT_FEE_MASK, 1, 12) : new Array(12).fill(0);

    const budget = await resolvePropertyBudget(code, year, workbooks);
    const budgetMonthly = budget ? budgetMonthsForMask(budget.lines, MGMT_FEE_MASK) : new Array(12).fill(0);

    const ytdActual = sum(feeMonthly);
    const annualBudget = sum(budgetMonthly);
    // Skip anything with neither an actual fee nor a budgeted fee (not a
    // fee-paying building, or a fund shell with no own GL).
    if (ytdActual === 0 && annualBudget === 0) continue;

    const maxPosted = stored?.maxPeriodInFile ?? 0;
    buildings.push({
      code, key: m.key, name: propName(code), group: groupOf(code), groupLabel: REPORT_GROUP_LABELS[groupOf(code)],
      feeMonthly, budgetMonthly,
      ytdActual: Math.round(ytdActual),
      ytdBudget: Math.round(sum(budgetMonthly.slice(0, Math.max(1, maxPosted)))),
      annualBudget: Math.round(annualBudget),
      maxPosted, hasGl: !!stored, budgetFallback: !!budget?.fallback,
    });
  }

  // Order: by group (BP, SC, LIK, Other → we exclude LIK), then by code.
  buildings.sort((a, b) => (REPORT_GROUP_ORDER.indexOf(a.group) - REPORT_GROUP_ORDER.indexOf(b.group)) || a.code.localeCompare(b.code));

  const groups = REPORT_GROUP_ORDER
    .map((key) => ({ key, label: REPORT_GROUP_LABELS[key], codes: buildings.filter((b) => b.group === key).map((b) => b.code) }))
    .filter((g) => g.codes.length);

  // Portfolio rollups.
  const actualMonthly = new Array(12).fill(0);
  const budgetBottomUpMonthly = new Array(12).fill(0);
  for (const b of buildings) for (let m = 0; m < 12; m++) { actualMonthly[m] += b.feeMonthly[m]; budgetBottomUpMonthly[m] += b.budgetMonthly[m]; }

  // Complete-through: the latest month every GL-bearing building has posted, so
  // the portfolio total isn't dragged down by a building that's a month behind.
  const withGl = buildings.filter((b) => b.hasGl && b.maxPosted > 0);
  const completeThrough = withGl.length ? Math.min(...withGl.map((b) => b.maxPosted)) : 0;

  const lik = await likManagementPlan(year, workbooks);

  return {
    year,
    months: MONTHS,
    buildings,
    groups,
    portfolio: {
      actualMonthly: actualMonthly.map(Math.round),
      budgetBottomUpMonthly: budgetBottomUpMonthly.map(Math.round),
      likPlanMonthly: lik ? lik.months : null,
      ytdActual: Math.round(sum(actualMonthly.slice(0, Math.max(1, completeThrough)))),
      ytdBudgetBottomUp: Math.round(sum(budgetBottomUpMonthly.slice(0, Math.max(1, completeThrough)))),
      annualBudgetBottomUp: Math.round(sum(budgetBottomUpMonthly)),
      likPlanYtd: lik ? Math.round(sum(lik.months.slice(0, Math.max(1, completeThrough)))) : null,
      likPlanAnnual: lik ? lik.total : null,
    },
    completeThrough,
    likPlan: lik ? { budgetYear: lik.budgetYear, fallback: lik.fallback } : null,
    budgetFallback: buildings.some((b) => b.budgetFallback),
  };
}

export type MgmtFeeDetail = {
  code: string;
  name: string;
  year: number;
  maxPosted: number;
  months: { month: number; fee: number; revenue: number; feePctOfRevenue: number | null; budget: number }[];
  ytd: { fee: number; revenue: number; feePctOfRevenue: number | null; budget: number };
};

/** Per-building drill-down: monthly management fee, that month's revenue, and
 *  the fee as a % of revenue (the sanity check — fees are usually a fixed % of
 *  collections), plus the budgeted fee. */
export async function managementFeeDetail(code: string, year: number): Promise<MgmtFeeDetail | null> {
  const gl = await assembledGl(code, year);
  const feeMonthly = gl ? lineMonthly(gl.monthly, MGMT_FEE_MASK, 1, 12) : new Array(12).fill(0);
  const maxPosted = gl?.maxPeriodInFile ?? 0;

  const loaded = await loadFullYearStatement(code, year);
  const revenueMonthly = loaded?.payload.rollups.totalRevenues.monthly ?? new Array(12).fill(0);

  const budget = await resolvePropertyBudget(code, year);
  const budgetMonthly = budget ? budgetMonthsForMask(budget.lines, MGMT_FEE_MASK) : new Array(12).fill(0);

  if (!gl && !loaded && !budget) return null;

  const months = [];
  for (let m = 0; m < 12; m++) {
    const fee = Math.round(feeMonthly[m]);
    const revenue = Math.round(revenueMonthly[m] ?? 0);
    months.push({
      month: m + 1, fee, revenue,
      feePctOfRevenue: revenue > 0 ? (fee / revenue) * 100 : null,
      budget: Math.round(budgetMonthly[m]),
    });
  }
  const upto = Math.max(1, maxPosted);
  const ytdFee = Math.round(sum(feeMonthly.slice(0, upto)));
  const ytdRev = Math.round(sum(revenueMonthly.slice(0, upto)));
  return {
    code, name: propName(code), year, maxPosted, months,
    ytd: { fee: ytdFee, revenue: ytdRev, feePctOfRevenue: ytdRev > 0 ? (ytdFee / ytdRev) * 100 : null, budget: Math.round(sum(budgetMonthly.slice(0, upto))) },
  };
}
