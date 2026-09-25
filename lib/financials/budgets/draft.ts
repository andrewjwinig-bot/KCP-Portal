// Budget draft — auto-seed next year's budget from the data we already have,
// so Nancy/Harry adjust a draft instead of keying from scratch (budget season).
//
// Phase 1, expense baseline: each expense/capital line is seeded from the
// CURRENT year's Reprojection (actual-through blended with budget) grown by one
// editable % — carried month-by-month so seasonality (snow, etc.) is preserved,
// not flattened to an annual average. Debt service carries flat (contractual).
// Revenue + reimbursement lines are carried flat as PLACEHOLDERS here; the
// lease-based revenue projection and CAM/RET estimate sync replace them in the
// next Phase-1 increments.

import "server-only";
import { loadReprojection } from "@/lib/financials/reprojections/load";
import type { ReprojLine } from "@/lib/financials/reprojections/compute";
import { listLoans } from "@/lib/debt/storage";
import { budgetDebt, loansForStatement, FUND_SHELL, fundDebtShares, shareOfDebt, addDebt, type BudgetLoan } from "./debtBudget";
import { EXPENSE_ROLES, type SectionRole } from "@/lib/financials/operating-statements/types";
import { projectLeaseRevenue, type ExpiringLease, type VacantUnit, type RentRow, type ContractedLease } from "./leaseRevenue";
import { getLeasingAssumptions } from "./leasingAssumptions";
import { estimateReimbursements, type ReimbursementEstimate } from "./reimbursementEstimate";
import { expenseInputKindOf, resolveKind, splitAcrossLines, type ExpenseInputKind } from "./expenseInputs";
import { basisForLine } from "@/lib/financials/operating-statements/rentCheck";
import { getExpenseInputs } from "./expenseInputStore";
import { getLineOverrides } from "./lineOverrideStore";
import { getInPlaceRevenue } from "./inPlaceStore";
import { lineKey, mergeMonths, type LineOverrides } from "./lineOverrides";
import { ownerFor } from "./contributors";
import { bucketsFor } from "./lineBuckets";
import { itemizedLines, type ResolvedBucket } from "./lineItems";
import { payrollBlocks, poolAnnual, allocatePool, type PoolBlock, type PoolEntries } from "./payrollPools";
import { getPoolEntries } from "./payrollPoolStore";
import { bookForProperty } from "./books";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import { applyManagementFee, priorFeeRates } from "./managementFee";
import { mixedCenterFor, splitLine } from "./mixedPools";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { glKeysFor } from "@/lib/financials/cash-analysis/funds";
import { groupOf } from "@/lib/reports/monthly";
import { listBudgets } from "./storage";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { isVacancyUtilitiesLine, resolveRate, monthsAt, type VacancyUtilities } from "./vacancyUtilities";
import { assembledGlConsolidated } from "@/lib/financials/operating-statements/statementStore";
import { cashOnGl, distributionsOnGl, plannedDistributions, projectBalance, rollForward, DISTRIBUTIONS_SECTION, DISTRIBUTIONS_LABEL, OPENING_LABEL, type DraftCash } from "./cashForecast";

/** The revenue line the lease projection replaces — base/rental income. */
const RENTAL_LINE_RE = /rental|rent income|base rent|minimum rent/i;

const EXPENSE_ROLE_SET = new Set<SectionRole>([...EXPENSE_ROLES, "capital"]);
const r0 = (n: number) => Math.round(n);
const sum = (a: number[]) => a.reduce((s, n) => s + (n || 0), 0);

/** How a drafted line's numbers were produced — shown as a badge so the source
 *  is transparent and the subjective bits are obvious. */
export type DraftSource = "reproj-growth" | "reproj-flat" | "leases" | "cam-estimate"
  /** Real estate taxes at their default: this year + 3%, same months. */
  | "ret-default"
  /** A figure someone keyed in the Expenses step (tax, insurance, maintenance). */
  | "entered"
  /** Debt service from the Debt Tracker's loan schedules. */
  | "loans"
  /** Built item by item from last year's budget (`lineItems.ts`). */
  | "items"
  /** This property's share of a payroll total entered once for the book. */
  | "pool"
  /** The management fee: last year's rate × this budget's gross revenue. */
  | "fee"
  /** LIK Management (2010)'s fee REVENUE: every building's budgeted fee. */
  | "fee-rollup"
  /** Non-reimbursable utilities: vacant SF × a $/SF rate (`vacancyUtilities.ts`). */
  | "vacancy";

export type BudgetDraftLine = {
  label: string;
  mask: string;
  /** A roll-up line's figure, property by property (`consolidate.ts`). */
  byProperty?: { code: string; name: string; months: number[]; total: number }[];
  /** A management-fee line's rate, % of gross revenue (`managementFee.ts`). */
  feePct?: number;
  /** Non-reimbursable utilities on vacant space: the rate and the SF by month. */
  vacancy?: VacancyUtilities;
  /** Drafted 12 monthly amounts (display orientation: positive). */
  months: number[];
  total: number;
  /** Prior-year reprojection full-year total this line was grown from. */
  basisTotal: number;
  source: DraftSource;
  /** Months typed straight into the grid (true = that month is typed). */
  typed?: boolean[];
  /** The GL accounts the line is built from — its SUB-LINES — when there is
   *  more than one. `typeable` sub-lines are budgeted one by one (the line is
   *  their sum); otherwise they show how a keyed/derived line splits. */
  subLines?: BudgetSubLine[];
  /** Set on a line the Budget Inputs page owns (taxes, insurance, building
   *  maintenance) — keyed there, by its owner, never typed into the grid. */
  inputKind?: ExpenseInputKind;
  /** Set on a line (or the part of it) that is this property's share of a
   *  payroll total entered once for the book (`payrollPools.ts`). */
  pool?: { key: string; label: string; gl: string; sharePct: number; annual: number; entered: boolean; amount: number }[];
};

export type BudgetSubLine = {
  /** The GL account — or, on a bucketed line, the BUCKET name. */
  account: string;
  /** Set on a budget bucket (`lineBuckets.ts`): "base" carries the line's own
   *  figure and is typed as the line; "extra" adds to it. */
  bucket?: "base" | "extra" | "seeded";
  name?: string;
  /** What the row reads as, when it is not `account` (an item's own name —
   *  `account` carries its "bucket/item" key). */
  label?: string;
  /** Last year's budget for this bucket or item — shown for reference, not
   *  in the reprojection column (items have no actuals to reproject). */
  prior?: number;
  /** The budget workbook's own note on the row. */
  note?: string;
  /** A seeded bucket's items (Sprinkler Inspection, Backflow…). */
  items?: BudgetSubLine[];
  months: number[];
  total: number;
  basisTotal: number;
  typed?: boolean[];
  typeable: boolean;
};

export type BudgetDraftSection = {
  name: string;
  role: SectionRole;
  lines: BudgetDraftLine[];
  subtotal: number[];
  total: number;
};

export type BudgetDraftRollup = { months: number[]; total: number };

export type BudgetDraft = {
  propertyCode: string;
  propertyName: string;
  budgetYear: number;
  /** The reprojection year the draft was grown from (budgetYear − 1). */
  basisYear: number;
  /** Growth % applied to expenses (e.g. 3 = 3%). */
  growthPct: number;
  sections: BudgetDraftSection[];
  rollups: {
    totalRevenues: BudgetDraftRollup;
    totalOperatingExpenses: BudgetDraftRollup;
    netOperatingIncome: BudgetDraftRollup;
  };
  /** Lease inputs behind the projected rental line — surfaced so leasing
   *  assumptions (renew / vacate / lease-up) are obvious and actionable. */
  leasing?: {
    inPlaceUnits: number;
    projectedRentalTotal: number;
    expiring: ExpiringLease[];
    vacant: VacantUnit[];
    /** Leases in place all year — any can be backed out. */
    contracted?: ContractedLease[];
    assumptionsApplied: number;
    /** The property code assumptions are saved under (for the save endpoint). */
    propertyCode: string;
    /** True when the rent and this list come from the imported schedule. */
    fromSchedule: boolean;
    /** Every suite's rent by month, contracted vs assumed — sums to the rent line. */
    rentRows: RentRow[];
    /** The TI and leasing commissions the deals carry, for the year. */
    dealCapital: { ti: number; lc: number };
    /** Who owns these calls — Harry (shopping centres) or Nancy (office parks). */
    owner: { id: string; label: string };
  };
  /** Per-tenant CAM/INS/RET recoveries — Step 3. Its monthly totals ARE the
   *  recovery income lines (source "cam-estimate"). */
  reimbursementEstimate?: ReimbursementEstimate;
  /** 2010 only: each building's budgeted management fee, which is 2010's
   *  fee revenue (4510) — the two sides of one intercompany entry. */
  feeRollup?: FeeRollupRow[];
  /** The tie-out: each recovery category's tenant total against the budget
   *  line(s) it lands on. */
  recoveryTie?: RecoveryTie[];
  /** Every suite's rent + recoveries, month by month (Step 1's master table). */
  tenantRevenue?: TenantRevenueRow[];
  /** Set on a BOOK's roll-up ("All Shopping Centers"): the sum of these
   *  properties' drafts (`consolidate.ts`) — read-only, and each line carries
   *  its per-property split in `byProperty`. */
  consolidated?: { properties: { code: string; name: string }[] };
  /** The budget line base rent lands on. */
  rentLineLabel?: string;
  /** The loans behind the debt-service lines (Debt Tracker), when any. */
  debt?: { loans: BudgetLoan[]; interest: number; principal: number;
    /** A fund building's share of the fund's loans, and what set it. */
    fundShare?: { share: number; basis: "prior-budget" | "sqft" } };
  /** Set by the route: notes left on the lines, keyed `section::label`. */
  notes?: Record<string, { text: string; by: string; at: string }>;
  /** Set by the route: whether the viewer may type months into the grid. */
  canEditLines?: boolean;
  /** Set by the route: which lines the viewer may type ("all" / "expenses"). */
  lineEditScope?: "all" | "expenses" | null;
  /** True when the current-year reprojection couldn't be loaded (no draft). */
  missingBasis?: boolean;
  /** Below cash flow: distributions and the projected bank balance. */
  cash?: DraftCash;
};

/** One suite's whole revenue for the budget year — base rent plus its CAM,
 *  insurance and tax recoveries — the Step 1 "Revenue by tenant" table. Every
 *  suite on the rent side is here (vacancies and gross leases included, so a
 *  suite paying nothing is visible), in the rent table's order. */
export type TenantRevenueRow = {
  unitRef: string;
  tenant: string;
  sqft: number;
  status: RentRow["status"];
  rent: number[]; cam: number[]; ins: number[]; ret: number[];
  /** true = that month rests on a leasing assumption. */
  assumed: boolean[];
  note?: string;
  method?: ReimbursementEstimate["tenants"][number]["method"];
  /** A mixed centre's part the suite is reconciled in (7010: retail / office). */
  portion?: "retail" | "office";
  /** A recovery row with no rent-side suite (a unit ref that did not match). */
  recoveryOnly?: boolean;
  /** Today's monthly recovery billing, off the rent roll. */
  billing?: RentRow["billing"];
};

const canonRef = (ref: string) => String(ref ?? "").trim().toUpperCase().replace(/-CU$/, "");

/** Join the rent rows and the recovery estimate, suite by suite. A suite with
 *  two recovery entries (a recon tenant and a lease-up) sums them. */
export function combineTenantRevenue(rentRows: RentRow[], est: ReimbursementEstimate | null | undefined): TenantRevenueRow[] {
  const zero = () => new Array(12).fill(0) as number[];
  const byUnit = new Map<string, ReimbursementEstimate["tenants"]>();
  for (const t of est?.tenants ?? []) {
    const k = canonRef(t.unitRef);
    byUnit.set(k, [...(byUnit.get(k) ?? []), t]);
  }
  const add = (a: number[], b: number[]) => a.map((v, i) => v + (b[i] || 0));
  const fill = (row: TenantRevenueRow, ts: ReimbursementEstimate["tenants"]) => {
    for (const t of ts) {
      row.cam = add(row.cam, t.cam); row.ins = add(row.ins, t.ins); row.ret = add(row.ret, t.ret);
      row.assumed = row.assumed.map((a, i) => a || !!t.assumed[i]);
    }
    // The note and method of the tenant actually paying — else the first.
    const lead = ts.find((t) => t.monthsActive > 0) ?? ts[0];
    if (lead) { row.note = lead.note; row.method = lead.method; row.portion = lead.portion; }
  };
  const out: TenantRevenueRow[] = rentRows.map((r) => {
    const row: TenantRevenueRow = {
      unitRef: r.unitRef, tenant: r.tenant, sqft: r.sqft, status: r.status,
      rent: r.months.slice(), cam: zero(), ins: zero(), ret: zero(), assumed: r.assumed.slice(),
      billing: r.billing,
    };
    const ts = byUnit.get(canonRef(r.unitRef));
    if (ts) { fill(row, ts); byUnit.delete(canonRef(r.unitRef)); }
    return row;
  });
  for (const ts of byUnit.values()) {
    const t = ts[0];
    const row: TenantRevenueRow = {
      unitRef: t.unitRef, tenant: t.name, sqft: 0, status: "contracted",
      rent: zero(), cam: zero(), ins: zero(), ret: zero(), assumed: zero().map(() => false), recoveryOnly: true,
    };
    fill(row, ts);
    out.push(row);
  }
  return out;
}

export type RecoveryTie = {
  basis: "cam" | "ins" | "ret";
  /** The tenants' total, month by month. */
  estimate: number[];
  estimateTotal: number;
  /** The budget lines carrying it (more than one when a category is split). */
  lines: { section: string; label: string; mask: string; months: number[]; total: number }[];
  linesTotal: number;
  ties: boolean;
};

/** Compare each category's tenant total with the lines it was written to. A
 *  category with money and no line to land on is the one way it can fail. */
export function tieRecoveries(
  est: { kind: "retail" | "office"; monthly: { cam: number[]; ins: number[]; ret: number[] } },
  sections: BudgetDraftSection[],
): RecoveryTie[] {
  const out: RecoveryTie[] = [];
  const cats: ("cam" | "ins" | "ret")[] = est.kind === "retail" ? ["cam", "ins", "ret"] : ["cam", "ret"];
  for (const basis of cats) {
    const estimate = est.monthly[basis].map(r0);
    const lines: RecoveryTie["lines"] = [];
    for (const sec of sections) {
      if (sec.role !== "revenue" && sec.role !== "reimbursement") continue;
      for (const l of sec.lines) {
        if (l.source !== "cam-estimate") continue;
        const b = basisForLine(l.label, l.mask);
        if ((b === "other" ? "ins" : b) !== basis) continue;
        lines.push({ section: sec.name, label: l.label, mask: l.mask, months: l.months, total: l.total });
      }
    }
    const estimateTotal = r0(sum(estimate));
    if (!lines.length && !estimateTotal) continue;
    const linesTotal = r0(lines.reduce((a, l) => a + l.total, 0));
    const byMonth = estimate.every((v, i) => Math.abs(v - lines.reduce((a, l) => a + (l.months[i] || 0), 0)) < 1);
    out.push({ basis, estimate, estimateTotal, lines, linesTotal, ties: lines.length > 0 && byMonth && Math.abs(linesTotal - estimateTotal) < 1 });
  }
  return out;
}

const isCondoAssnLine = (label: string) => /^\s*condo\s+ass(n|oc|ociation)\b/i.test(label);
const isShoppingCenter = (code: string) => PROPERTY_DEFS.find((d) => d.id === String(code).toUpperCase())?.allocGroup === "SC";

function grow(months: number[], factor: number): number[] {
  return months.map((m) => r0((m || 0) * factor));
}
function addInto(acc: number[], add: number[]) {
  for (let i = 0; i < 12; i++) acc[i] += add[i] ?? 0;
}

/** A line's sub-lines, one per GL account, when it has more than one. A line
 *  grown from the forecast is budgeted sub-line by sub-line (each account
 *  grown on its own months); a line whose figure comes from elsewhere (a
 *  lease, a keyed input) is split across its accounts in proportion, for
 *  reading only. */
/** Accounts the GL export leaves unnamed, named as the owner's chart does. */
const ACCOUNT_NAME_FALLBACK: Record<string, string> = {
  "6620-8501": "Commissions-Internal Broker",
  "1940-8501": "Outside Leasing Commissions",
};
/** Capital accounts the owner never budgets — dropped from the split while
 *  they are empty (budget and this year both $0), so no money is hidden. */
const HIDE_WHEN_EMPTY = new Set(["1410-0000", "1470-0000"]); // Land, Appliances

function withSubLines(
  line: BudgetDraftLine, accounts: ReprojLine["accounts"], names0: Record<string, string>, factor: number | null, role: SectionRole,
): BudgetDraftLine {
  // A bucketed line (maintenance, insurance, cleaning) is split by KIND of
  // spend instead — the buckets replace the account split.
  if (bucketsFor(role, line.label)) return line;
  const names = { ...ACCOUNT_NAME_FALLBACK, ...Object.fromEntries(Object.entries(names0).filter(([, v]) => !!v)) };
  const accts = (accounts ?? []).filter((a) => !(HIDE_WHEN_EMPTY.has(a.account) && a.blended.every((v) => Math.abs(v || 0) < 0.5)));
  if (accts.length < 2) return line;
  const computed = line.source === "reproj-growth" || line.source === "reproj-flat";
  if (computed) {
    const subLines: BudgetSubLine[] = accts.map((a) => {
      const months = factor != null ? grow(a.blended, factor) : a.blended.map(r0);
      return { account: a.account, name: names[a.account], months, total: r0(sum(months)), basisTotal: r0(sum(a.blended)), typeable: true };
    });
    const months = new Array(12).fill(0);
    for (const s of subLines) addInto(months, s.months);
    return { ...line, months: months.map(r0), total: r0(sum(months)), subLines };
  }
  const parts = splitAcrossLines(line.months, accts.map((a) => a.blended));
  return {
    ...line,
    subLines: accts.map((a, i) => ({
      account: a.account, name: names[a.account], months: parts[i].map(r0), total: r0(sum(parts[i])), basisTotal: r0(sum(a.blended)), typeable: false,
    })),
  };
}

/** Lay typed months over the computed ones and re-total each section. A line
 *  the Budget Inputs page owns is marked and never takes a typed month. A line
 *  with typeable sub-lines is typed THROUGH them — its months are their sum. */
function applyTyped(sections: BudgetDraftSection[], doc: LineOverrides, itemized?: Map<string, ResolvedBucket[]>) {
  for (const sec of sections) {
    sec.lines = sec.lines.map((l0) => {
      // Runs twice (before and after the recovery pools are read), so a
      // bucketed line is first taken back to its BASE figure — otherwise the
      // second pass would add its extra buckets on again.
      const base = l0.subLines?.find((s) => s.bucket === "base");
      const l = base ? { ...l0, months: base.months, total: base.total, typed: base.typed, subLines: undefined } : l0;
      // An ITEMIZED line is the sum of its items, whatever else produced it.
      const items = itemized?.get(lineKey(sec.name, l0.label));
      if (items) return fromItems({ ...l0, subLines: undefined }, items, expenseInputKindOf(sec.role, l0.label) ?? undefined);
      return withBuckets(sec, typedLine(sec, l, doc), doc);
    });
    const subtotal = new Array(12).fill(0);
    for (const l of sec.lines) addInto(subtotal, l.months);
    sec.subtotal = subtotal.map(r0); sec.total = r0(sum(subtotal));
  }
}

/** One line with its typed months laid over. */
function typedLine(sec: BudgetDraftSection, l: BudgetDraftLine, doc: LineOverrides): BudgetDraftLine {
  const inputKind = expenseInputKindOf(sec.role, l.label) ?? undefined;
  if (inputKind) return { ...l, inputKind };
  // A recovery line IS the Step 3 estimate — each tenant's share under
  // their own CAM methodology. A typed month would break that tie, so a
  // recovery line never takes one (and any stored before the lock is
  // ignored rather than left to drift the line away from its tenants).
  if (l.source === "cam-estimate") return l;
  // Likewise rent, and the TI / commissions the deals carry: they are
  // Step 1 — the schedule and the leasing decisions — and change there.
  if (l.source === "leases") return l;
  // The management fee is a formula on revenue — typed revenue moves it.
  if (l.source === "fee" || l.source === "fee-rollup" || l.source === "vacancy") return l;
  // A payroll share is the book's total × this property's share — changed by
  // the total, never typed here (other accounts on the line still are).
  if (l.source === "pool" && !l.subLines?.some((s) => s.typeable)) return l;
  if (l.subLines?.some((s) => s.typeable)) {
    const subLines = l.subLines.map((s) => {
      const ov = doc[`${lineKey(sec.name, l.label)}#${s.account}`];
      // A derived sub-line (commissions, a payroll share) takes no typed month.
      if (!ov || !s.typeable) return s;
      const { months, typed } = mergeMonths(s.months, ov);
      return { ...s, months, typed, total: r0(sum(months)) };
    });
    const months = new Array(12).fill(0);
    for (const s of subLines) addInto(months, s.months);
    const typed = months.map((_, i) => subLines.some((s) => s.typed?.[i]));
    return { ...l, subLines, months: months.map(r0), total: r0(sum(months)), typed: typed.some(Boolean) ? typed : undefined };
  }
  const ov = doc[lineKey(sec.name, l.label)];
  if (!ov) return l;
  const { months, typed } = mergeMonths(l.months, ov);
  return { ...l, months, total: r0(sum(months)), typed, source: typed.every(Boolean) ? "entered" : l.source };
}

/** A line built from its seeded buckets and items (`lineItems.ts`). */
function fromItems(l: BudgetDraftLine, buckets: ResolvedBucket[], inputKind?: ExpenseInputKind): BudgetDraftLine {
  const tot = (m: number[]) => r0(sum(m));
  const subLines: BudgetSubLine[] = buckets.map((b) => ({
    account: b.key, label: b.name, bucket: "seeded", months: b.months, total: tot(b.months), basisTotal: 0,
    typed: b.typed, typeable: b.items.length === 0, prior: tot(b.prior), note: b.note,
    items: b.items.length ? b.items.map((it) => ({
      account: it.key, label: it.name, months: it.months, total: tot(it.months), basisTotal: 0,
      typed: it.typed, typeable: true, prior: tot(it.prior), note: it.note,
    })) : undefined,
  }));
  const months = new Array(12).fill(0);
  for (const x of subLines) addInto(months, x.months);
  const typed = months.map((_, i) => subLines.some((x) => x.typed?.[i]));
  return { ...l, inputKind, subLines, months: months.map(r0), total: r0(sum(months)), typed: typed.some(Boolean) ? typed : undefined, source: "items" };
}

/** Split a bucketed line into its buckets (`lineBuckets.ts`): the base bucket
 *  is the line's own figure; each other bucket is its typed months (zero until
 *  typed) and adds to the line. */
function withBuckets(sec: BudgetDraftSection, l: BudgetDraftLine, doc: LineOverrides): BudgetDraftLine {
  const set = bucketsFor(sec.role, l.label);
  if (!set) return l;
  const subLines: BudgetSubLine[] = set.buckets.map((name) => {
    if (name === set.base) {
      return { account: name, bucket: "base", months: l.months, total: l.total, basisTotal: l.basisTotal, typed: l.typed, typeable: true };
    }
    const { months, typed } = mergeMonths(new Array(12).fill(0), doc[`${lineKey(sec.name, l.label)}#${name}`]);
    return { account: name, bucket: "extra", months, total: r0(sum(months)), basisTotal: 0, typed: typed.some(Boolean) ? typed : undefined, typeable: true };
  });
  const months = new Array(12).fill(0);
  for (const x of subLines) addInto(months, x.months);
  return { ...l, subLines, months: months.map(r0), total: r0(sum(months)) };
}


/** A property's budget of record for `year` — a final (or uploaded) workbook
 *  before a draft one. Null when there is none, or the draft is a fund. */
export async function priorBudgetProperty(propertyCode: string, year: number) {
  return (await priorBudgetProperties([propertyCode], year))[0] ?? null;
}

/** Every property of a book in the budget of record for `year`. */
export async function priorBudgetProperties(codes: string[], year: number) {
  const wbs = (await listBudgets().catch(() => [])).filter((w) => w.year === year);
  const rank = (w: (typeof wbs)[number]) => (w.status === "draft" ? 1 : 0);
  wbs.sort((a, b) => rank(a) - rank(b));
  const out: NonNullable<(typeof wbs)[number]["properties"][number]>[] = [];
  for (const c of codes) {
    const code = String(c ?? "").toUpperCase();
    for (const w of wbs) {
      const p = w.properties.find((x) => String(x.propertyCode ?? "").toUpperCase() === code);
      if (p) { out.push(p); break; }
    }
  }
  return out;
}

/** Lay the book's payroll shares onto this property's lines: each block goes
 *  to the first expense line whose mask takes its GL — onto that account's
 *  sub-line where the line has one, else onto the line. */
function applyPools(sections: BudgetDraftSection[], code: string, blocks: PoolBlock[], entries: PoolEntries) {
  const claimed = new Map<string, BudgetDraftLine>();
  for (const b of blocks) {
    const { annual, entered } = poolAnnual(b, entries[b.key]);
    const months = allocatePool(b, annual, code);
    if (!months) continue;
    let target: { sec: BudgetDraftSection; idx: number } | null = null;
    for (const sec of sections) {
      if (!EXPENSE_ROLE_SET.has(sec.role) || sec.role === "capital") continue;
      const idx = sec.lines.findIndex((l) => l.mask && accountMatchesMask(l.mask, b.gl));
      if (idx >= 0) { target = { sec, idx }; break; }
    }
    if (!target) continue;
    const l0 = target.sec.lines[target.idx];
    const first = !claimed.has(l0.label + l0.mask);
    const info = { key: b.key, label: b.label, gl: b.gl, sharePct: b.shares[code.toUpperCase()] ?? 0, annual, entered, amount: r0(sum(months)) };
    let line: BudgetDraftLine;
    const sub = l0.subLines?.find((x) => x.account === b.gl);
    if (sub) {
      // The pooled account's months are the blocks' sum; the line's other
      // accounts keep their own figures.
      const subLines = l0.subLines!.map((x) => x !== sub ? x : {
        ...x, months: first ? months : x.months.map((v, i) => v + months[i]), typed: undefined, typeable: false,
      });
      subLines.forEach((x) => { x.total = r0(sum(x.months)); });
      const lm = new Array(12).fill(0);
      for (const x of subLines) addInto(lm, x.months);
      line = { ...l0, subLines, months: lm.map(r0), total: r0(sum(lm)), source: "pool", pool: [...(first ? [] : l0.pool ?? []), info] };
    } else {
      const lm = first ? months : l0.months.map((v, i) => v + months[i]);
      line = { ...l0, subLines: undefined, months: lm, total: r0(sum(lm)), source: "pool", pool: [...(first ? [] : l0.pool ?? []), info] };
    }
    target.sec.lines[target.idx] = line;
    claimed.set(line.label + line.mask, line);
  }
  for (const sec of sections) {
    const subtotal = new Array(12).fill(0);
    for (const l of sec.lines) addInto(subtotal, l.months);
    sec.subtotal = subtotal.map(r0); sec.total = r0(sum(subtotal));
  }
}

/** Build a draft FY budget for one property/fund, growing the current-year
 *  reprojection's expense forecast by `growthPct`. Returns `missingBasis` when
 *  there's no reprojection to seed from. */
const LIK_MANAGEMENT = "2010";

export type FeeRollupRow = { code: string; name: string; months: number[]; total: number; feePct?: number };

/** Every fee-paying building's budgeted management fee — the buildings the
 *  Management Fees page lists: not LIK itself (2000 / 2010), and not a fund,
 *  whose draft consolidates buildings already counted. Four at a time; a
 *  building whose draft cannot be built is left out rather than failing 2010. */
async function managementFeeRollup(budgetYear: number, growthPct: number): Promise<FeeRollupRow[]> {
  const list = (await availableStatements()).filter((m) => groupOf(m.propertyCode) !== "lik" && glKeysFor(m.key).length === 1);
  const out: FeeRollupRow[] = [];
  const queue = [...list];
  const worker = async () => {
    for (let m = queue.shift(); m; m = queue.shift()) {
      const d = await buildBudgetDraft(m.key, budgetYear, growthPct).catch(() => null);
      if (!d) continue;
      const months = new Array(12).fill(0);
      let feePct: number | undefined;
      for (const sec of d.sections) {
        if (sec.role === "revenue" || sec.role === "reimbursement") continue;
        for (const l of sec.lines) {
          if (!/management fee/i.test(l.label) || !l.mask.split(",").some((a) => a.trim().startsWith("6610"))) continue;
          addInto(months, l.months);
          feePct ??= l.feePct;
        }
      }
      const total = r0(sum(months));
      if (total) out.push({ code: d.propertyCode, name: d.propertyName, months: months.map(r0), total, feePct });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out.sort((a, b) => b.total - a.total);
}

export async function buildBudgetDraft(key: string, budgetYear: number, growthPct: number): Promise<BudgetDraft | null> {
  const basisYear = budgetYear - 1;
  const loaded = await loadReprojection(key, basisYear);
  if (!loaded) return null;
  const { reprojection: r, meta } = loaded;

  const factor = 1 + (growthPct || 0) / 100;
  const revMonths = new Array(12).fill(0);
  const expMonths = new Array(12).fill(0);

  // Lease-based rental projection for this property (funds fall back to flat),
  // shaped by any saved leasing assumptions (renew / vacate / lease-up).
  const assumptions = await getLeasingAssumptions(budgetYear, [meta.propertyCode]);
  // The imported rent schedule (Step 1), when there is one for this property's
  // group — it replaces "today's rent roll held flat" with every contracted
  // charge, month by month, and drives the expiring / vacancy list.
  const group = PROPERTY_DEFS.find((d) => d.id === String(meta.propertyCode).toUpperCase())?.allocGroup;
  const scheduleCategory = group === "SC" ? "Shopping Centers" : group === "BP" ? "Office" : null;
  const scheduleRec = scheduleCategory ? await getInPlaceRevenue(budgetYear, scheduleCategory).catch(() => null) : null;
  const lease = await projectLeaseRevenue([meta.propertyCode], budgetYear, assumptions, scheduleRec?.charges ?? null);
  let rentalReplaced = false;

  // THE EXPENSES STEP. Real estate taxes, insurance and building maintenance
  // take the figure their owner keyed (or, for taxes, this year + 3%) rather
  // than the book's growth %. A kind can sit on more than one line, so each
  // kind is resolved ONCE across all its lines and then split between them.
  const inputs = await getExpenseInputs(budgetYear, meta.propertyCode).catch(() => ({}));
  const kindLines = new Map<ExpenseInputKind, { key: string; basis: number[] }[]>();
  for (const sec of r.sections) {
    for (const l of sec.lines) {
      const k = expenseInputKindOf(sec.role, l.label);
      if (!k) continue;
      const arr = kindLines.get(k) ?? [];
      arr.push({ key: `${sec.name}::${l.label}`, basis: l.blended });
      kindLines.set(k, arr);
    }
  }
  const keyedMonths = new Map<string, { months: number[]; source: DraftSource }>();
  for (const [k, lines] of kindLines) {
    const basis = new Array(12).fill(0);
    for (const x of lines) addInto(basis, x.basis);
    const res = resolveKind(k, basis, growthPct, inputs[k]);
    const parts = splitAcrossLines(res.months, lines.map((x) => x.basis));
    const source: DraftSource = res.entered ? "entered" : k === "ret" ? "ret-default" : "reproj-growth";
    lines.forEach((x, i) => keyedMonths.set(x.key, { months: parts[i], source }));
  }

  const typedDoc = await getLineOverrides(budgetYear, meta.propertyCode).catch(() => ({} as LineOverrides));

  const sections: BudgetDraftSection[] = r.sections.map((sec) => {
    const isExpense = EXPENSE_ROLE_SET.has(sec.role);
    const built: BudgetDraftLine[] = sec.lines.map((l) => {
      // The primary rental line on a revenue section is projected from the
      // rent roll's in-place leases; the first such line wins (avoids catching
      // "rent reimbursement" etc.).
      if (!rentalReplaced && sec.role === "revenue" && lease.hasData && RENTAL_LINE_RE.test(l.label)) {
        rentalReplaced = true;
        return {
          label: l.label, mask: l.mask,
          months: lease.rentalMonthly.map(r0),
          total: r0(sum(lease.rentalMonthly)),
          basisTotal: r0(l.reprojTotal),
          source: "leases",
        };
      }
      const keyed = keyedMonths.get(`${sec.name}::${l.label}`);
      if (keyed) {
        return {
          label: l.label, mask: l.mask,
          months: keyed.months.map(r0),
          total: r0(sum(keyed.months)),
          basisTotal: r0(l.reprojTotal),
          source: keyed.source,
        };
      }
      // Expenses/capital grow by the assumption; debt + other revenue/
      // reimbursement carry flat (CAM/RET reimbursements refined in Phase 3).
      const grown = isExpense;
      const months = grown ? grow(l.blended, factor) : l.blended.map(r0);
      return {
        label: l.label,
        mask: l.mask,
        months,
        total: r0(sum(months)),
        basisTotal: r0(l.reprojTotal),
        source: grown ? "reproj-growth" : "reproj-flat",
      };
    });
    const lines = built.map((b, i) => withSubLines(b, sec.lines[i].accounts, r.accountNames ?? {}, isExpense ? factor : null, sec.role));
    const subtotal = new Array(12).fill(0);
    for (const l of lines) addInto(subtotal, l.months);
    return { name: sec.name, role: sec.role, lines, subtotal: subtotal.map(r0), total: r0(sum(subtotal)) };
  });

  // THE DEALS' CAPITAL. A renewal or lease-up that carries TI $/sf or a
  // commission $/sf puts those dollars on the Capital section's Tenant
  // improvements (1440) and Outside Leasing Commissions (1940-8501) lines, in the
  // month its new rent starts. The line IS the deals — $0 until the leasing
  // owner keys TI or an LC % on a call. It is NEVER this year's figure grown:
  // TI is spent because a lease was signed, so growing 2026's by 3% budgets
  // last year's leases a second time (9510 did exactly that while no call
  // carried TI yet). Only a property with no leasing data at all keeps it.
  const dealLine = (re: RegExp, months: number[] | undefined) => {
    if (!lease.hasData) return;
    months = months ?? new Array(12).fill(0);
    const sec = sections.find((x) => x.role === "capital" && x.lines.some((l) => re.test(l.label) || re.test(l.mask)));
    const idx = sec?.lines.findIndex((l) => re.test(l.label) || re.test(l.mask)) ?? -1;
    if (!sec || idx < 0) return;
    const l = sec.lines[idx];
    sec.lines[idx] = { ...l, months: months.map(r0), total: r0(sum(months)), source: "leases", subLines: undefined };
  };
  dealLine(/tenant improvement|^1440/i, lease.tiMonthly);
  dealLine(/lease cost|leasing commission|1940-8501/i, lease.lcMonthly);
  // The INTERNAL broker's commissions on those same deals (Harry $1/SF, Nancy
  // by term) → Commissions-Internal Broker (6620-8501). That account rides on
  // the salaries line with 6010-8501, so the commissions become its sub-line.
  // Like TI and the outside LC, it is ONLY the deals Harry / Nancy key — $0
  // until they do — never this year's commissions grown.
  const COMMISSION_ACCT = "6620-8501";
  const cm = lease.hasData ? (lease.commissionMonthly ?? new Array(12).fill(0)) : undefined;
  if (cm) {
    for (const sec of sections) {
      if (!EXPENSE_ROLE_SET.has(sec.role) || sec.role === "capital") continue;
      const idx = sec.lines.findIndex((l) => l.mask && accountMatchesMask(l.mask, COMMISSION_ACCT));
      if (idx < 0) continue;
      const l = sec.lines[idx];
      const sub: BudgetSubLine = { account: COMMISSION_ACCT, name: "Commissions-Internal Broker", months: cm.map(r0), total: r0(sum(cm)), basisTotal: l.subLines?.find((x) => x.account === COMMISSION_ACCT)?.basisTotal ?? 0, typeable: false };
      const others: BudgetSubLine[] = l.subLines?.length
        ? l.subLines.filter((x) => x.account !== COMMISSION_ACCT)
        // A line with no split yet: what it carried is the other account(s).
        : [{ account: l.mask.split(",").filter((a) => a.trim() !== COMMISSION_ACCT).join(",") || l.label, months: l.months, total: l.total, basisTotal: l.basisTotal, typeable: true }];
      const subLines = [...others, sub];
      const months = new Array(12).fill(0);
      for (const x of subLines) addInto(months, x.months);
      sec.lines[idx] = { ...l, subLines, months: months.map(r0), total: r0(sum(months)) };
      break;
    }
  }

  // DEBT SERVICE from the loans themselves (Debt Tracker): each month's
  // interest and principal off the lender's schedule, rather than this year's
  // figure carried flat — a loan amortizes, so principal rises and interest
  // falls through the year, and a maturity or a rate reset is in the schedule.
  const allLoans = await listLoans().catch(() => []);
  let debt = budgetDebt(loansForStatement(allLoans, key, meta.propertyCode), budgetYear);
  // A FUND building (JV III, NI LLC) also carries its share of the fund's
  // loans — booked on the holding entity (3600 / 4000), budgeted on the
  // buildings in the proportions last year's budget of record used.
  let debtShare: { share: number; basis: "prior-budget" | "sqft" } | undefined;
  const def = PROPERTY_DEFS.find((d) => d.id === String(meta.propertyCode).toUpperCase());
  const shell = def && !def.entityKind && def.fundGroup ? FUND_SHELL[def.fundGroup] : undefined;
  if (shell) {
    const fundDebt = budgetDebt(allLoans.filter((l) => String(l.property ?? "").toUpperCase() === shell), budgetYear);
    if (fundDebt) {
      const siblings = PROPERTY_DEFS.filter((d) => d.fundGroup === def!.fundGroup && !d.entityKind).map((d) => d.id);
      const prior = await priorBudgetProperties(siblings, basisYear);
      const priorDebt = (code: string) => {
        const p = prior.find((x) => String(x.propertyCode).toUpperCase() === code);
        let t = 0;
        for (const sec of p?.sections ?? []) for (const l of sec.lines) {
          if (l.isSubtotal || !l.glAccount) continue;
          if (/^(9210|2720|2740)-8501$/.test(l.glAccount)) t += Math.abs(l.total || 0);
        }
        return t;
      };
      const { shares, basis } = fundDebtShares(siblings.map((c) => ({ code: c, priorDebt: priorDebt(c), sqft: PROPERTY_DEFS.find((d) => d.id === c)?.sqft ?? 0 })));
      const share = shares[def!.id] ?? 0;
      if (share > 0) {
        debt = addDebt(debt, shareOfDebt(fundDebt, share));
        debtShare = { share, basis };
      }
    }
  }
  if (debt) {
    const debtLine = (re: RegExp, months: number[]) => {
      for (const sec of sections) {
        if (sec.role !== "debt-service") continue;
        const idx = sec.lines.findIndex((l) => re.test(l.label));
        if (idx < 0) continue;
        const l = sec.lines[idx];
        sec.lines[idx] = { ...l, months: months.map(r0), total: r0(sum(months)), source: "loans", subLines: undefined };
        return;
      }
    };
    debtLine(/interest/i, debt.interest);
    debtLine(/amorti[sz]ation|principal/i, debt.principal);
  }

  // TYPED MONTHS win over whatever computed them — applied BEFORE the pools
  // are read, so a CAM expense typed into the grid moves what tenants are
  // billed, and again after the recoveries replace their income lines.
  // LAST YEAR'S BUDGET OF RECORD, for the itemized lines (Building
  // Maintenance's contracts and recurring items, the insurance policies…):
  // the workbook for the basis year that carries this property.
  // PAYROLL: each block entered once for the book and allocated across it.
  const book = bookForProperty(meta.propertyCode);
  if (book?.properties.length) {
    const blocks = payrollBlocks(await priorBudgetProperties(book.properties, basisYear));
    if (blocks.length) applyPools(sections, meta.propertyCode, blocks, await getPoolEntries(budgetYear, book.id).catch(() => ({})));
  }
  const priorProperty = await priorBudgetProperty(meta.propertyCode, basisYear);
  const itemized = itemizedLines(priorProperty, sections, typedDoc);
  applyTyped(sections, typedDoc, itemized);
  // NON-REIMBURSABLE UTILITIES are the vacant space's: vacant SF by month ×
  // a $/SF rate, so a lease-up takes its suite off the line from its start.
  if (lease.hasData) {
    for (const sec of sections) {
      sec.lines = sec.lines.map((l) => {
        if (!isVacancyUtilitiesLine(sec.role, l.label)) return l;
        const v = resolveRate(typedDoc, sec.name, l.label, l.basisTotal, lease.rows ?? []);
        if (!v) return l;
        const months = monthsAt(v.rate, v.sf);
        return { ...l, months, total: r0(sum(months)), source: "vacancy" as DraftSource, subLines: undefined, typed: undefined, vacancy: v };
      });
      const subtotal = new Array(12).fill(0);
      for (const l of sec.lines) addInto(subtotal, l.months);
      sec.subtotal = subtotal.map(r0); sec.total = r0(sum(subtotal));
    }
  }
  // The fee on revenue as it stands, so the CAM pool carries it (a business
  // park's fee is recoverable); set again once the recoveries are in.
  const feeRates = priorFeeRates(priorProperty);
  let fee = applyManagementFee(sections, feeRates);

  let reimbursementEstimate: ReimbursementEstimate | undefined;
  // A RECOVERABLE fee is in the pool the recoveries are figured on, and the
  // recoveries are in the revenue the fee is figured on — one more pass once
  // the fee has settled makes the two agree.
  for (let pass = 0; pass < 2; pass++) {
  // RECOVERIES. The budget's CAM, insurance and tax pools against this year's,
  // read off the draft's own expense lines — so the taxes and premium keyed in
  // the Expenses step move what tenants are billed. Then each tenant's share
  // from the last reconciliation, cut to the months the leasing assumptions
  // say they are there (recoveryMath.ts), replaces the recovery income lines.
  const pool = { cam: [0, 0], ins: [0, 0], ret: [0, 0] }; // [budget, basis]
  // A MIXED centre (7010) keeps a second, office pool: the office tenants are
  // reconciled on it, and the retail tenants on what is left (mixedPools.ts).
  const mixed = mixedCenterFor(meta.propertyCode);
  const officePool = { cam: [0, 0], ins: [0, 0], ret: [0, 0] };
  for (const sec of sections) {
    for (const l of sec.lines) {
      const k = expenseInputKindOf(sec.role, l.label);
      const kind = k === "ret" ? "ret" as const : k === "insurance" ? "ins" as const : sec.role === "reimbursable-expense" ? "cam" as const : null;
      if (!kind) continue;
      if (mixed) {
        const sp = splitLine(mixed, kind, l);
        pool[kind][0] += sp.retail[0]; pool[kind][1] += sp.retail[1];
        officePool[kind][0] += sp.office[0]; officePool[kind][1] += sp.office[1];
      } else {
        pool[kind][0] += l.total; pool[kind][1] += l.basisTotal;
      }
    }
  }
  const ratioOf = ([budget, basis]: number[]) => (basis > 0 ? budget / basis : 1);
  reimbursementEstimate = (await estimateReimbursements(meta.propertyCode, budgetYear, growthPct, {
    poolRatios: { cam: ratioOf(pool.cam), ins: ratioOf(pool.ins), ret: ratioOf(pool.ret) },
    officePoolRatios: mixed ? { cam: ratioOf(officePool.cam), ins: ratioOf(officePool.ins), ret: ratioOf(officePool.ret) } : undefined,
    assumptions,
    // Recoveries start and stop where RENT does — the same leasing decisions.
    tenancy: lease.hasData ? lease.rows : undefined,
  }).catch(() => null)) ?? undefined;

  if (reimbursementEstimate) {
    const est = reimbursementEstimate;
    // Each recovery income line takes the category the rent roll bills it
    // under (`basisForLine`: CAM, RE tax, and insurance on "other"). Office
    // recovers insurance inside CAM, so its insurance line is left as it was.
    const byBasis: Record<string, { sec: BudgetDraftSection; idx: number }[]> = {};
    for (const sec of sections) {
      if (sec.role !== "revenue" && sec.role !== "reimbursement") continue;
      sec.lines.forEach((l, idx) => {
        const b = basisForLine(l.label, l.mask);
        if (b === "cam" || b === "ret" || (b === "other" && est.kind === "retail")) (byBasis[b] ??= []).push({ sec, idx });
      });
    }
    const monthsFor: Record<string, number[]> = { cam: est.monthly.cam, ret: est.monthly.ret, other: est.monthly.ins };
    for (const [b, targets] of Object.entries(byBasis)) {
      const parts = splitAcrossLines(monthsFor[b], targets.map((t) => t.sec.lines[t.idx].months));
      targets.forEach((t, i) => {
        const l = t.sec.lines[t.idx];
        t.sec.lines[t.idx] = { ...l, months: parts[i].map(r0), total: r0(sum(parts[i])), source: "cam-estimate", subLines: undefined };
      });
    }
    applyTyped(sections, typedDoc, itemized);
  }
  const before = fee.total;
  fee = applyManagementFee(sections, feeRates);
  if (!fee.reimbursable || Math.abs(fee.total - before) < 1) break;
  }
  const recoveryTie = reimbursementEstimate ? tieRecoveries(reimbursementEstimate, sections) : undefined;
  const rentLineLabel = sections.flatMap((sec) => sec.role === "revenue" ? sec.lines : []).find((l) => l.source === "leases")?.label;

  // SHOPPING CENTERS HAVE NO CONDO ASSOCIATION. The statement mapping gives
  // every property a "Condo Assn" recovery line (4970-*), which on a shopping
  // centre is always empty — so it is dropped from their budgets. Only while
  // it IS empty: a centre that ever posts to it keeps the line, so money is
  // never hidden.
  if (isShoppingCenter(meta.propertyCode)) {
    for (const sec of sections) {
      // Cleaning & Supplies is a business-park line: on a centre it is empty,
      // and its buckets (Cleaning / Vacancies) would be two rows of nothing.
      const before = sec.lines.length;
      // The management fee is NON-reimbursable at the centres (6610-8501); the
      // reimbursable section's Management Fee (6610-8502) is always empty there.
      // Cleaning & Supplies and Office Center/Other (6*-8503, the OFFICE part
      // of a building) belong to Parkwood (7010), the one centre with an
      // office centre upstairs — at the others they are empty rows (owner).
      const officeCentre = !!mixedCenterFor(meta.propertyCode);
      const hidden = (l: BudgetDraftLine) => isCondoAssnLine(l.label)
        || (sec.role === "reimbursable-expense" && /^\s*management\s+fee/i.test(l.label))
        || (!officeCentre && (/^\s*cleaning\s*&\s*supplies/i.test(l.label) || /^\s*office\s+center/i.test(l.label)));
      sec.lines = sec.lines.filter((l) => !(hidden(l) && l.total === 0 && l.basisTotal === 0));
      if (sec.lines.length !== before) {
        const subtotal = new Array(12).fill(0);
        for (const l of sec.lines) addInto(subtotal, l.months);
        sec.subtotal = subtotal.map(r0); sec.total = r0(sum(subtotal));
      }
    }
  }

  // LIK MANAGEMENT (2010) EARNS EVERY BUILDING'S FEE. Its 4510 revenue and the
  // buildings' 6610 expense are one intercompany entry and must tie, so 2010's
  // budget does not grow its own figure — it is the sum of the buildings'
  // drafts, each fee a formula on that building's own revenue.
  let feeRollup: FeeRollupRow[] | undefined;
  if (String(meta.propertyCode).toUpperCase() === LIK_MANAGEMENT) {
    feeRollup = await managementFeeRollup(budgetYear, growthPct);
    const months = new Array(12).fill(0);
    for (const b of feeRollup) addInto(months, b.months);
    for (const sec of sections) {
      if (sec.role !== "revenue") continue;
      const idx = sec.lines.findIndex((l) => l.mask && accountMatchesMask(l.mask, "4510-0000"));
      if (idx < 0) continue;
      sec.lines[idx] = { ...sec.lines[idx], months: months.map(r0), total: r0(sum(months)), source: "fee-rollup", subLines: undefined };
      const subtotal = new Array(12).fill(0);
      for (const l of sec.lines) addInto(subtotal, l.months);
      sec.subtotal = subtotal.map(r0); sec.total = r0(sum(subtotal));
      break;
    }
  }

  // NOI is revenue less OPERATING expenses. Capital sits BELOW it (the grid
  // takes it off NOI on the way to cash flow), and so does debt service —
  // counting capital here understated NOI by the year's TI and improvements
  // and then took it off a second time for cash flow.
  const OPERATING = new Set<SectionRole>(EXPENSE_ROLES);
  for (const sec of sections) {
    if (OPERATING.has(sec.role)) addInto(expMonths, sec.subtotal);
    else if (sec.role === "revenue" || sec.role === "reimbursement") addInto(revMonths, sec.subtotal);
  }

  const noiMonths = revMonths.map((v, i) => r0(v - expMonths[i]));

  // DISTRIBUTIONS AND THE BANK BALANCE (`cashForecast.ts`). Cash flow after
  // capital and debt, less the partners' distributions, rolled forward from
  // the cash on the GL today.
  const cash = await (async (): Promise<DraftCash> => {
    const below = new Array(12).fill(0);
    for (const sec of sections) if (sec.role === "capital" || sec.role === "debt-service") addInto(below, sec.subtotal);
    const cashFlow = noiMonths.map((v, i) => v - below[i]);
    // This year's cash flow by month, off the reprojection it is grown from.
    const basisFlow = new Array(12).fill(0);
    for (const sec of r.sections) {
      const sign = sec.role === "revenue" || sec.role === "reimbursement" ? 1 : -1;
      for (const l of sec.lines) for (let i = 0; i < 12; i++) basisFlow[i] += sign * (l.blended?.[i] || 0);
    }
    const gl = await assembledGlConsolidated(key, basisYear).catch(() => null);
    const onGl = cashOnGl(gl);
    const plan = plannedDistributions(meta.propertyCode);
    const projectedYearEnd = onGl ? rollForward(onGl.balance, onGl.month, basisFlow, plan) : null;
    const dist = mergeMonths(plan, typedDoc[lineKey(DISTRIBUTIONS_SECTION, DISTRIBUTIONS_LABEL)]);
    const anyTyped = dist.typed.some(Boolean);
    const openTyped = typedDoc[lineKey(DISTRIBUTIONS_SECTION, OPENING_LABEL)]?.months?.[0];
    const opening = openTyped != null ? r0(openTyped) : projectedYearEnd ?? 0;
    return {
      gl: onGl ? { balance: onGl.balance, year: basisYear, month: onGl.month, accounts: onGl.accounts } : null,
      projectedYearEnd,
      opening,
      openingTyped: openTyped != null,
      distributions: {
        months: dist.months, total: r0(sum(dist.months)), typed: anyTyped ? dist.typed : undefined,
        source: anyTyped ? "entered" : sum(plan) ? "plan" : "none",
        basisYearActual: distributionsOnGl(gl),
      },
      balance: projectBalance(opening, cashFlow, dist.months),
    };
  })();

  return {
    cash,
    propertyCode: meta.propertyCode,
    propertyName: meta.propertyName,
    budgetYear,
    basisYear,
    growthPct,
    sections,
    rollups: {
      totalRevenues: { months: revMonths.map(r0), total: r0(sum(revMonths)) },
      totalOperatingExpenses: { months: expMonths.map(r0), total: r0(sum(expMonths)) },
      netOperatingIncome: { months: noiMonths, total: r0(sum(noiMonths)) },
    },
    leasing: lease.hasData ? {
      inPlaceUnits: lease.inPlaceUnits,
      projectedRentalTotal: lease.rentalTotal,
      expiring: lease.expiring,
      vacant: lease.vacant,
      contracted: lease.contracted ?? [],
      assumptionsApplied: lease.assumptionsApplied,
      propertyCode: meta.propertyCode,
      fromSchedule: !!lease.fromSchedule,
      rentRows: lease.rows ?? [],
      dealCapital: { ti: r0(sum(lease.tiMonthly ?? [])), lc: r0(sum(lease.lcMonthly ?? [])) },
      owner: (() => {
        const def = PROPERTY_DEFS.find((d) => d.id === String(meta.propertyCode).toUpperCase());
        const id = ownerFor("renewal", def?.allocGroup);
        return { id, label: id.charAt(0).toUpperCase() + id.slice(1) };
      })(),
    } : undefined,
    reimbursementEstimate,
    feeRollup,
    recoveryTie,
    tenantRevenue: lease.hasData ? combineTenantRevenue(lease.rows ?? [], reimbursementEstimate) : undefined,
    rentLineLabel,
    debt: debt ? { loans: debt.loans, interest: r0(sum(debt.interest)), principal: r0(sum(debt.principal)), fundShare: debtShare } : undefined,
  };
}
