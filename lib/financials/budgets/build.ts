// Build a live BudgetWorkbook from the data the portal already has:
//   - Current rent roll → in-place rental income + monthly CAM/INS/RET reimbursements
//   - Debt Tracker      → projected interest + principal for the budget year
//   - Optional prior uploaded budget → OpEx lines lifted at × (1 + growthPct/100)
//
// Phase 2a scope: revenues + reimbursements + debt service from data; OpEx
// from prior budget; everything else stubbed at 0 for the user to fill in
// once editing ships in Phase 2b. The Skyline Import block is regenerated
// from the live numbers using the GL mapping from the prior budget when
// one's available; otherwise we emit our own GL set.

import "server-only";
import type { Loan } from "@/lib/debt/amortization";
import { buildSchedule } from "@/lib/debt/amortization";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import type {
  BudgetCategory,
  BudgetLine,
  BudgetSection,
  BudgetWorkbook,
  PropertyBudget,
  SkylineImportLine,
} from "./types";

// Rent-roll subset we read from /api/rentroll's stored snapshot.
type RentRollUnitLite = {
  unitRef: string;
  isVacant?: boolean;
  amenity?: unknown;
  baseRent?: number;        // monthly base rent
  opexMonth?: number;       // CAM monthly billed
  reTaxMonth?: number;      // RET monthly billed
  otherMonth?: number;      // INS monthly billed
};
type RentRollPropertyLite = {
  propertyCode: string;
  reportedPropertyName?: string;
  totalSqft?: number;
  occupiedSqft?: number;
  units: RentRollUnitLite[];
};

const CATEGORY_PROPERTY_TYPE: Record<BudgetCategory, "Office" | "Retail" | "Residential" | null> = {
  "Shopping Centers": "Retail",
  "Office":           "Office",
  "Residential":      "Residential",
  "Other":            null,
};

function zeroMonths(): number[] { return Array(12).fill(0); }
function sumMonths(ms: number[]): number { return ms.reduce((s, m) => s + m, 0); }
function lift(ms: number[], factor: number): number[] { return ms.map((m) => Math.round(m * factor)); }

function totalAcross(lines: BudgetLine[]): number[] {
  const out = zeroMonths();
  for (const l of lines) {
    if (l.isSubtotal) continue;
    for (let i = 0; i < 12; i++) out[i] += l.months[i] ?? 0;
  }
  return out;
}

function copyMonthsFromPrior(section: BudgetSection | null, label: string): number[] | null {
  if (!section) return null;
  const line = section.lines.find(
    (l) => !l.isSubtotal && l.label.toLowerCase() === label.toLowerCase(),
  );
  return line ? [...line.months] : null;
}

function findSectionByNameHint(prior: BudgetWorkbook | null, propertyCode: string, hint: RegExp): BudgetSection | null {
  if (!prior) return null;
  const property = prior.properties.find((p) => p.propertyCode.toUpperCase() === propertyCode.toUpperCase());
  if (!property) return null;
  return property.sections.find((s) => hint.test(s.name)) ?? null;
}

function rentRollPropertiesForCategory(
  rentroll: { properties: RentRollPropertyLite[] },
  category: BudgetCategory,
): RentRollPropertyLite[] {
  const propType = CATEGORY_PROPERTY_TYPE[category];
  if (!propType) return rentroll.properties;
  const codes = new Set(
    PROPERTY_DEFS.filter((p) => p.type === propType).map((p) => p.id.toUpperCase()),
  );
  return rentroll.properties.filter((p) => codes.has(p.propertyCode.toUpperCase()));
}

function propertyName(code: string, fallback: string | undefined): string {
  const def = PROPERTY_DEFS.find((p) => p.id.toUpperCase() === code.toUpperCase());
  return def?.name ?? fallback ?? code;
}

// ── Section builders ────────────────────────────────────────────────────────

function buildRevenuesSection(
  units: RentRollUnitLite[],
  prior: BudgetSection | null,
): { section: BudgetSection; monthsTotal: number[] } {
  const monthlyBase = units
    .filter((u) => !u.isVacant && !u.amenity)
    .reduce((s, u) => s + (u.baseRent ?? 0), 0);

  const lines: BudgetLine[] = [
    {
      glAccount: "4230-8501", subCategory: null, label: "Rental Income - In Place",
      months: Array(12).fill(monthlyBase),
      total: monthlyBase * 12, totalPsf: null, input: null,
      notes: "Auto from current rent roll (flat — no escalations applied)",
      isSubtotal: false,
    },
    {
      glAccount: "4230-8501", subCategory: null, label: "Rental Income - New & Renewal",
      months: zeroMonths(), total: 0, totalPsf: null, input: null,
      notes: "Set in the Renew & Vac panel (Phase 2b)",
      isSubtotal: false,
    },
    {
      glAccount: "4240-8501", subCategory: null, label: "Percentage Rents",
      months: zeroMonths(), total: 0, totalPsf: null, input: null, notes: null, isSubtotal: false,
    },
    {
      glAccount: "4990-8501", subCategory: null, label: "Miscellaneous",
      months: copyMonthsFromPrior(prior, "Miscellaneous") ?? zeroMonths(),
      total: 0, totalPsf: null, input: null, notes: null, isSubtotal: false,
    },
    {
      glAccount: "9190-8501", subCategory: null, label: "Interest Income",
      months: copyMonthsFromPrior(prior, "Interest Income") ?? zeroMonths(),
      total: 0, totalPsf: null, input: null, notes: null, isSubtotal: false,
    },
  ];
  for (const l of lines) l.total = sumMonths(l.months);
  const monthsTotal = totalAcross(lines);
  lines.push({
    glAccount: null, subCategory: null, label: "Total Rental and Other",
    months: monthsTotal, total: sumMonths(monthsTotal),
    totalPsf: null, input: null, notes: null, isSubtotal: true,
  });
  return { section: { name: "Revenues", lines }, monthsTotal };
}

function buildReimbursementsSection(
  units: RentRollUnitLite[],
  prior: BudgetSection | null,
): { section: BudgetSection; monthsTotal: number[] } {
  const occupied = units.filter((u) => !u.isVacant && !u.amenity);
  const cam = occupied.reduce((s, u) => s + (u.opexMonth ?? 0), 0);
  const ret = occupied.reduce((s, u) => s + (u.reTaxMonth ?? 0), 0);
  const ins = occupied.reduce((s, u) => s + (u.otherMonth ?? 0), 0);

  const lines: BudgetLine[] = [
    {
      glAccount: "4710-8502", subCategory: null, label: "Electric",
      months: copyMonthsFromPrior(prior, "Electric") ?? zeroMonths(),
      total: 0, totalPsf: null, input: null, notes: null, isSubtotal: false,
    },
    {
      glAccount: "4910-8502", subCategory: null, label: "Common Area Maintenance",
      months: Array(12).fill(cam), total: cam * 12, totalPsf: null, input: null,
      notes: "Auto from rent roll · sum of monthly CAM billed",
      isSubtotal: false,
    },
    {
      glAccount: "4920-8502", subCategory: null, label: "Real Estate Taxes",
      months: Array(12).fill(ret), total: ret * 12, totalPsf: null, input: null,
      notes: "Auto from rent roll · sum of monthly RET billed",
      isSubtotal: false,
    },
    {
      glAccount: "4930-8502", subCategory: null, label: "Insurance",
      months: Array(12).fill(ins), total: ins * 12, totalPsf: null, input: null,
      notes: "Auto from rent roll · sum of monthly INS billed",
      isSubtotal: false,
    },
  ];
  for (const l of lines) l.total = sumMonths(l.months);
  const monthsTotal = totalAcross(lines);
  lines.push({
    glAccount: null, subCategory: null, label: "Total Reimbursements",
    months: monthsTotal, total: sumMonths(monthsTotal),
    totalPsf: null, input: null, notes: null, isSubtotal: true,
  });
  return { section: { name: "Reimbursements", lines }, monthsTotal };
}

function liftExpenseSection(prior: BudgetSection | null, growthFactor: number, name: string): {
  section: BudgetSection;
  monthsTotal: number[];
} {
  if (!prior) {
    return { section: { name, lines: [] }, monthsTotal: zeroMonths() };
  }
  const lines: BudgetLine[] = prior.lines.map((l) => {
    const months = l.isSubtotal ? zeroMonths() : lift(l.months, growthFactor);
    return {
      ...l,
      months,
      total: sumMonths(months),
      notes: l.isSubtotal
        ? null
        : `Defaulted to ${Math.round((growthFactor - 1) * 100)}% over prior year`,
    };
  });
  const nonSubtotal = lines.filter((l) => !l.isSubtotal);
  const monthsTotal = totalAcross(nonSubtotal);
  // Recompute subtotals to reflect the lift
  for (const l of lines) {
    if (l.isSubtotal) {
      l.months = monthsTotal;
      l.total = sumMonths(monthsTotal);
    }
  }
  return { section: { name: prior.name || name, lines }, monthsTotal };
}

function buildCapitalSection(prior: BudgetSection | null): {
  section: BudgetSection;
  monthsTotal: number[];
} {
  if (!prior) {
    return { section: { name: "Capital Improvements", lines: [] }, monthsTotal: zeroMonths() };
  }
  const lines: BudgetLine[] = prior.lines.map((l) => ({
    ...l,
    months: zeroMonths(),
    total: 0,
    notes: l.isSubtotal ? null : "Manual entry",
  }));
  return { section: { name: prior.name || "Capital Improvements", lines }, monthsTotal: zeroMonths() };
}

function buildDebtServiceSection(
  loans: Loan[],
  propertyCode: string,
  year: number,
): { section: BudgetSection; monthsTotal: number[] } {
  const propertyLoans = loans.filter((l) => l.property?.toUpperCase() === propertyCode.toUpperCase());
  const interestMonths = zeroMonths();
  const amortMonths = zeroMonths();
  for (const loan of propertyLoans) {
    const schedule = buildSchedule(loan);
    for (const row of schedule) {
      const [y, m] = row.date.split("-").map(Number);
      if (y !== year) continue;
      const idx = m - 1;
      if (idx < 0 || idx > 11) continue;
      interestMonths[idx] += row.interest;
      amortMonths[idx] += row.principal;
    }
  }
  const interestMonthsRounded = interestMonths.map((m) => Math.round(m));
  const amortMonthsRounded = amortMonths.map((m) => Math.round(m));
  const lines: BudgetLine[] = [
    {
      glAccount: "9210-8501", subCategory: null, label: "Interest",
      months: interestMonthsRounded, total: sumMonths(interestMonthsRounded),
      totalPsf: null, input: null,
      notes: "Auto from Debt Tracker projections",
      isSubtotal: false,
    },
    {
      glAccount: "2740-8501", subCategory: null, label: "Mortgage Amortization",
      months: amortMonthsRounded, total: sumMonths(amortMonthsRounded),
      totalPsf: null, input: null,
      notes: "Auto from Debt Tracker projections",
      isSubtotal: false,
    },
    {
      glAccount: "2740-0000", subCategory: null, label: "Loan Proceeds",
      months: zeroMonths(), total: 0, totalPsf: null, input: null, notes: null, isSubtotal: false,
    },
  ];
  const monthsTotal = totalAcross(lines);
  lines.push({
    glAccount: null, subCategory: null, label: "Total Debt Service",
    months: monthsTotal, total: sumMonths(monthsTotal),
    totalPsf: null, input: null, notes: null, isSubtotal: true,
  });
  return { section: { name: "Debt Service", lines }, monthsTotal };
}

function buildSkylineImport(
  prior: PropertyBudget | null,
  sections: BudgetSection[],
): SkylineImportLine[] {
  // Index live non-subtotal lines by GL with sign applied (revenues +
  // reimbursements become credits / negatives — Skyline convention).
  const byGl = new Map<string, { label: string; months: number[]; total: number }>();
  for (const sec of sections) {
    const isCredit = /reven|reimburs/i.test(sec.name);
    for (const l of sec.lines) {
      if (l.isSubtotal || !l.glAccount) continue;
      const months = isCredit ? l.months.map((m) => -m) : l.months;
      const total = isCredit ? -l.total : l.total;
      byGl.set(l.glAccount, { label: l.label, months, total });
    }
  }
  // Mirror the prior Skyline list order when available so the import file
  // stays consistent year over year. Missing GLs are zero-filled with the
  // prior label so Skyline still finds a row.
  const out: SkylineImportLine[] = [];
  const used = new Set<string>();
  for (const seed of prior?.skylineImport ?? []) {
    const live = byGl.get(seed.glAccount);
    if (live) {
      out.push({ label: seed.label, glAccount: seed.glAccount, months: live.months, total: live.total });
    } else {
      out.push({ label: seed.label, glAccount: seed.glAccount, months: zeroMonths(), total: 0 });
    }
    used.add(seed.glAccount);
  }
  for (const [gl, line] of byGl) {
    if (used.has(gl)) continue;
    out.push({ label: line.label, glAccount: gl, months: line.months, total: line.total });
  }
  return out;
}

// ── Main entry point ────────────────────────────────────────────────────────

export type BuildLiveBudgetInput = {
  year: number;
  category: BudgetCategory;
  rentroll: { properties: RentRollPropertyLite[]; uploadedAt?: string } | null;
  loans: Loan[];
  prior: BudgetWorkbook | null;
  opExGrowthPct: number; // e.g. 3 → ×1.03
};

export function buildLiveBudget(input: BuildLiveBudgetInput): BudgetWorkbook {
  const growthFactor = 1 + input.opExGrowthPct / 100;
  const rrProps = input.rentroll
    ? rentRollPropertiesForCategory(input.rentroll, input.category)
    : [];

  const properties: PropertyBudget[] = rrProps.map((rrProp) => {
    const code = rrProp.propertyCode.toUpperCase();
    const priorProperty = input.prior?.properties.find(
      (p) => p.propertyCode.toUpperCase() === code,
    ) ?? null;
    const priorReimb     = findSectionByNameHint(input.prior, code, /^reimburs/i);
    const priorReimbExp  = findSectionByNameHint(input.prior, code, /^reimbursable/i);
    const priorNonReimb  = findSectionByNameHint(input.prior, code, /^non-reimbursable/i);
    const priorCapital   = findSectionByNameHint(input.prior, code, /capital/i);

    const rev      = buildRevenuesSection(rrProp.units, null);
    const reimb    = buildReimbursementsSection(rrProp.units, priorReimb);
    const reimbExp = liftExpenseSection(priorReimbExp, growthFactor, "Reimbursable Expenses");
    const nonReimb = liftExpenseSection(priorNonReimb, growthFactor, "Non-Reimbursable Expenses");
    const capital  = buildCapitalSection(priorCapital);
    const debt     = buildDebtServiceSection(input.loans, code, input.year);

    const sections: BudgetSection[] = [
      rev.section, reimb.section, reimbExp.section, nonReimb.section, capital.section, debt.section,
    ];

    const totalRevenuesMonths = rev.monthsTotal.map((v, i) => v + reimb.monthsTotal[i]);
    const totalOpExMonths     = reimbExp.monthsTotal.map((v, i) => v + nonReimb.monthsTotal[i]);
    const noiMonths           = totalRevenuesMonths.map((v, i) => v - totalOpExMonths[i]);
    const cfBeforeMonths      = noiMonths.map((v, i) => v - capital.monthsTotal[i]);
    const cfAfterMonths       = cfBeforeMonths.map((v, i) => v - debt.monthsTotal[i]);

    const rollups = [
      { name: "TOTAL REVENUES",                total: sumMonths(totalRevenuesMonths), months: totalRevenuesMonths },
      { name: "TOTAL OPERATING EXPENSES",      total: sumMonths(totalOpExMonths),     months: totalOpExMonths },
      { name: "NET OPERATING INCOME",          total: sumMonths(noiMonths),           months: noiMonths },
      { name: "CASH FLOW BEFORE DEBT SERVICE", total: sumMonths(cfBeforeMonths),      months: cfBeforeMonths },
      { name: "CASH FLOW AFTER DEBT SERVICE",  total: sumMonths(cfAfterMonths),       months: cfAfterMonths },
    ];

    const totalSqft = rrProp.totalSqft ?? 0;
    const occupiedSqft = rrProp.occupiedSqft ?? 0;
    const occPct = totalSqft > 0 ? (occupiedSqft / totalSqft) * 100 : 0;

    return {
      propertyCode: code,
      propertyName: propertyName(code, rrProp.reportedPropertyName),
      rentableSqft: totalSqft,
      occupancyPct: Array(12).fill(Number(occPct.toFixed(1))),
      occupancySqft: Array(12).fill(occupiedSqft),
      sections,
      rollups,
      skylineImport: buildSkylineImport(priorProperty, sections),
      skylineImportTotal: -sumMonths(cfAfterMonths),
    };
  });

  const label = `${input.category} ${input.year} Operating Budget`;
  const id = `live-${input.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${input.year}`;

  return {
    id,
    label,
    kind: "live",
    category: input.category,
    year: input.year,
    uploadedAt: new Date().toISOString(),
    source: {
      rentRollUploadedAt: input.rentroll?.uploadedAt,
      priorBudgetId: input.prior?.id,
      opExGrowthPct: input.opExGrowthPct,
    },
    properties,
  };
}
