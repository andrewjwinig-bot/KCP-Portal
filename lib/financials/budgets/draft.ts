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
import { EXPENSE_ROLES, type SectionRole } from "@/lib/financials/operating-statements/types";
import { projectLeaseRevenue, type ExpiringLease, type VacantUnit } from "./leaseRevenue";
import { getLeasingAssumptions } from "./leasingAssumptions";
import { estimateReimbursements, type ReimbursementEstimate } from "./reimbursementEstimate";
import { expenseInputKindOf, resolveKind, splitAcrossLines, type ExpenseInputKind } from "./expenseInputs";
import { basisForLine } from "@/lib/financials/operating-statements/rentCheck";
import { getExpenseInputs } from "./expenseInputStore";
import { getLineOverrides } from "./lineOverrideStore";
import { lineKey, mergeMonths, type LineOverrides } from "./lineOverrides";
import { ownerFor } from "./contributors";
import { PROPERTY_DEFS } from "@/lib/properties/data";

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
  | "entered";

export type BudgetDraftLine = {
  label: string;
  mask: string;
  /** Drafted 12 monthly amounts (display orientation: positive). */
  months: number[];
  total: number;
  /** Prior-year reprojection full-year total this line was grown from. */
  basisTotal: number;
  source: DraftSource;
  /** Months typed straight into the grid (true = that month is typed). */
  typed?: boolean[];
  /** Set on a line the Budget Inputs page owns (taxes, insurance, building
   *  maintenance) — keyed there, by its owner, never typed into the grid. */
  inputKind?: ExpenseInputKind;
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
    assumptionsApplied: number;
    /** The property code assumptions are saved under (for the save endpoint). */
    propertyCode: string;
    /** The TI and leasing commissions the deals carry, for the year. */
    dealCapital: { ti: number; lc: number };
    /** Who owns these calls — Harry (shopping centres) or Nancy (office parks). */
    owner: { id: string; label: string };
  };
  /** DISPLAY-ONLY per-tenant CAM/INS/RET reimbursement estimate (Phase 3). Does
   *  not yet drive the reimbursement lines — surfaced for verification first. */
  reimbursementEstimate?: ReimbursementEstimate;
  /** Set by the route: whether the viewer may type months into the grid. */
  canEditLines?: boolean;
  /** True when the current-year reprojection couldn't be loaded (no draft). */
  missingBasis?: boolean;
};

function grow(months: number[], factor: number): number[] {
  return months.map((m) => r0((m || 0) * factor));
}
function addInto(acc: number[], add: number[]) {
  for (let i = 0; i < 12; i++) acc[i] += add[i] ?? 0;
}

/** Lay typed months over the computed ones and re-total each section. A line
 *  the Budget Inputs page owns is marked and never takes a typed month. */
function applyTyped(sections: BudgetDraftSection[], doc: LineOverrides) {
  for (const sec of sections) {
    sec.lines = sec.lines.map((l) => {
      const inputKind = expenseInputKindOf(sec.role, l.label) ?? undefined;
      if (inputKind) return { ...l, inputKind };
      const ov = doc[lineKey(sec.name, l.label)];
      if (!ov) return l;
      const { months, typed } = mergeMonths(l.months, ov);
      return { ...l, months, total: r0(sum(months)), typed, source: typed.every(Boolean) ? "entered" : l.source };
    });
    const subtotal = new Array(12).fill(0);
    for (const l of sec.lines) addInto(subtotal, l.months);
    sec.subtotal = subtotal.map(r0); sec.total = r0(sum(subtotal));
  }
}

/** Build a draft FY budget for one property/fund, growing the current-year
 *  reprojection's expense forecast by `growthPct`. Returns `missingBasis` when
 *  there's no reprojection to seed from. */
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
  const lease = await projectLeaseRevenue([meta.propertyCode], budgetYear, assumptions);
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
    const lines: BudgetDraftLine[] = sec.lines.map((l) => {
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
    const subtotal = new Array(12).fill(0);
    for (const l of lines) addInto(subtotal, l.months);
    return { name: sec.name, role: sec.role, lines, subtotal: subtotal.map(r0), total: r0(sum(subtotal)) };
  });

  // THE DEALS' CAPITAL. A renewal or lease-up that carries TI $/sf or a
  // commission $/sf puts those dollars on the Capital section's Tenant
  // improvements (1440) and Capitalized Lease Costs (1940-8501) lines, in the
  // month its new rent starts. Where any deal carries one, the line IS the
  // deals — growing this year's TI by a percent budgets last year's leases
  // again; TI is spent because a lease was signed.
  const dealLine = (re: RegExp, months: number[] | undefined) => {
    if (!months || !months.some((m) => m)) return;
    const sec = sections.find((x) => x.role === "capital" && x.lines.some((l) => re.test(l.label) || re.test(l.mask)));
    const idx = sec?.lines.findIndex((l) => re.test(l.label) || re.test(l.mask)) ?? -1;
    if (!sec || idx < 0) return;
    const l = sec.lines[idx];
    sec.lines[idx] = { ...l, months: months.map(r0), total: r0(sum(months)), source: "leases" };
  };
  dealLine(/tenant improvement|^1440/i, lease.tiMonthly);
  dealLine(/lease cost|leasing commission|1940-8501/i, lease.lcMonthly);

  // TYPED MONTHS win over whatever computed them — applied BEFORE the pools
  // are read, so a CAM expense typed into the grid moves what tenants are
  // billed, and again after the recoveries replace their income lines.
  applyTyped(sections, typedDoc);

  // RECOVERIES. The budget's CAM, insurance and tax pools against this year's,
  // read off the draft's own expense lines — so the taxes and premium keyed in
  // the Expenses step move what tenants are billed. Then each tenant's share
  // from the last reconciliation, cut to the months the leasing assumptions
  // say they are there (recoveryMath.ts), replaces the recovery income lines.
  const pool = { cam: [0, 0], ins: [0, 0], ret: [0, 0] }; // [budget, basis]
  for (const sec of sections) {
    for (const l of sec.lines) {
      const k = expenseInputKindOf(sec.role, l.label);
      const bucket = k === "ret" ? pool.ret : k === "insurance" ? pool.ins : sec.role === "reimbursable-expense" ? pool.cam : null;
      if (!bucket) continue;
      bucket[0] += l.total; bucket[1] += l.basisTotal;
    }
  }
  const ratioOf = ([budget, basis]: number[]) => (basis > 0 ? budget / basis : 1);
  const reimbursementEstimate = (await estimateReimbursements(meta.propertyCode, budgetYear, growthPct, {
    poolRatios: { cam: ratioOf(pool.cam), ins: ratioOf(pool.ins), ret: ratioOf(pool.ret) },
    assumptions,
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
        t.sec.lines[t.idx] = { ...l, months: parts[i].map(r0), total: r0(sum(parts[i])), source: "cam-estimate" };
      });
    }
    applyTyped(sections, typedDoc);
  }

  for (const sec of sections) {
    if (EXPENSE_ROLE_SET.has(sec.role)) addInto(expMonths, sec.subtotal);
    else if (sec.role !== "debt-service") addInto(revMonths, sec.subtotal); // revenue + reimbursement
  }

  const noiMonths = revMonths.map((v, i) => r0(v - expMonths[i]));
  return {
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
      assumptionsApplied: lease.assumptionsApplied,
      propertyCode: meta.propertyCode,
      dealCapital: { ti: r0(sum(lease.tiMonthly ?? [])), lc: r0(sum(lease.lcMonthly ?? [])) },
      owner: (() => {
        const def = PROPERTY_DEFS.find((d) => d.id === String(meta.propertyCode).toUpperCase());
        const id = ownerFor("renewal", def?.allocGroup);
        return { id, label: id.charAt(0).toUpperCase() + id.slice(1) };
      })(),
    } : undefined,
    reimbursementEstimate,
  };
}
