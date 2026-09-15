// Operating Statements — cross-property "flags to investigate" review.
//
// Sweeps every mapped property and, for EACH uploaded month of the year,
// collects the statement lines that trip a "?" trend flag (amount jump vs
// recent months, or vs the same month last year) — excluding the ones staff
// have dismissed. The result is organized property → line → month, so a line's
// flagged months across the year sit together rather than in one flat list.

import "server-only";
import { availableStatements, getMapping } from "./mappingStore";
import { listFullGls, getDismissedFlags, getNotesBundle } from "./statementStore";
import { assembleGls } from "./glAssemble";
import { summaryForPeriod } from "./glParser";
import { computeStatement } from "./compute";
import { resolvePropertyBudget, makeBudgetLookup } from "./budgetCrosswalk";
import { lineMonthly } from "./lineSeries";
import { trendFlags } from "./trends";
import { reconcileGl } from "./glParser";
import { seasonalTrendFlags } from "./flagRules";
import { markMissingDebt } from "./debtFlag";
import { expectedPostedThrough } from "./outstanding";
import { PROPERTY_DEFS } from "@/lib/properties/data";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** One month where a line tripped a flag. */
export type ReviewMonth = {
  period: number;
  monthLabel: string;
  flags: string[];
  actual: number;
  budget: number | null;
  variance: number | null;
  note: string | null;
};

/** A statement line and every month of the year it was flagged. */
export type ReviewLine = {
  lineKey: string;
  section: string;
  line: string;
  months: ReviewMonth[];
};

/** A data-completeness issue on the latest month: a line we have evidence
 *  should carry a figure but that reads ~$0 (unposted), so a statement isn't
 *  actually complete. Higher priority than a trend "?" — it's likely an error /
 *  missing posting, not just a swing. */
export type ReviewIssue = {
  type: "not-posted" | "missing-debt";
  lineKey: string;
  section: string;
  line: string;
  period: number;
  monthLabel: string;
  /** Roughly how much is expected (budgeted YTD, or scheduled debt). */
  expected: number;
};

/** A property with its flagged lines (each carrying its flagged months). */
export type ReviewProperty = {
  key: string;
  propertyCode: string;
  propertyName: string;
  hasData: boolean;
  /** Latest uploaded month (1-12) and how many months are on file. */
  latestPeriod: number;
  latestMonthLabel: string;
  monthsCovered: number;
  lines: ReviewLine[];
  /** Total flagged (line, month) instances after dismissals. */
  flaggedMonthCount: number;
  /** Latest-month not-posted / missing-debt issues (data completeness). */
  issues: ReviewIssue[];
  /** GL self-reconciliation: does the file's own reported ending balances tie to
   *  its transactions? `mismatches > 0` means the import may be corrupt/partial. */
  tieOut: { checked: number; mismatches: number } | null;
  /** Coverage vs the expected posted-through month (current year only). Behind
   *  = the statement is stale (imported through an earlier month than expected). */
  coverage: { through: number; expected: number; behind: boolean } | null;
};

export type ReviewResult = {
  year: number;
  generatedAt: string;
  properties: ReviewProperty[];
  /** Portfolio rollups for the header / dashboard badge. */
  totals: { flaggedMonthCount: number; issueCount: number; propertiesWithIssues: number; tieOutIssues: number; coverageGaps: number };
};

function propertyName(key: string, fallback: string): string {
  return PROPERTY_DEFS.find((p) => p.id === key)?.name ?? fallback;
}

/** Collect every active "?" flagged line, per month, across all properties. */
export async function reviewFlaggedLines(year: number): Promise<ReviewResult> {
  const [mappings, fulls] = await Promise.all([availableStatements(), listFullGls()]);
  const properties: ReviewProperty[] = [];

  for (const m of mappings) {
    const name = propertyName(m.key, m.entityName);
    const stored = assembleGls(fulls.filter((g) => g.key === m.key && g.year === year));
    if (!stored) {
      properties.push({ key: m.key, propertyCode: m.propertyCode, propertyName: name, hasData: false, latestPeriod: 0, latestMonthLabel: "—", monthsCovered: 0, lines: [], flaggedMonthCount: 0, issues: [], tieOut: null, coverage: null });
      continue;
    }
    const storedPY = assembleGls(fulls.filter((g) => g.key === m.key && g.year === year - 1));
    const max = stored.maxPeriodInFile;
    const mapping = await getMapping(m.key);
    if (!mapping) continue;
    const budget = await resolvePropertyBudget(m.propertyCode, year);

    // Enumerate the statement's lines (section ladder + masks) from the latest
    // month; masks don't change month to month.
    // Only line up a same-year budget (matching the statement page), so the
    // not-posted / paid-YTD signals key off the right plan.
    const sameYearBudget = budget && !budget.fallback ? budget : null;
    const statementMax = computeStatement({
      mapping, propertyName: name, year, period: max,
      gl: summaryForPeriod(stored.monthly, max),
      budgetLookup: sameYearBudget ? makeBudgetLookup(sameYearBudget, max) : undefined,
    });
    // Latest-month data-completeness issues: budget-expected-but-unposted lines
    // (set by computeStatement) + debt scheduled but not posted (Debt Tracker).
    await markMissingDebt(statementMax, m.key, m.propertyCode, year, max);
    const issues: ReviewIssue[] = [];
    for (const sec of statementMax.sections) {
      for (const l of sec.lines) {
        if (!l.expectedMissing) continue;
        issues.push({
          type: l.expectedMissing.basis === "debt" ? "missing-debt" : "not-posted",
          lineKey: `${sec.name}::${l.label}`, section: sec.name, line: l.label,
          period: max, monthLabel: MONTHS[max - 1], expected: l.expectedMissing.expected,
        });
      }
    }
    issues.sort((a, b) => b.expected - a.expected);

    // GL tie-out: does the file reconcile with itself? (recomputed from the
    // stored monthly nets vs the reported ending balances).
    const recon = reconcileGl(stored);
    const tieOut = recon.checked > 0 ? { checked: recon.checked, mismatches: recon.mismatches.length } : null;
    // Coverage vs expected posted-through — only meaningful for the current year.
    const exp = expectedPostedThrough();
    const through = stored.coverageEnd ?? max;
    const coverage = year === exp.year ? { through, expected: exp.period, behind: through < exp.period } : null;

    // Pass 1 (in-memory): which (line, month) trip a flag. The monthly series is
    // computed once per line; a flag at month M evaluates the series 1..M.
    type Hit = { period: number; flags: string[] };
    const hitsByLine = new Map<string, { section: string; line: string; hits: Hit[] }>();
    const flaggedPeriods = new Set<number>();
    for (const sec of statementMax.sections) {
      const sign = sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1;
      for (const l of sec.lines) {
        const lineKey = `${sec.name}::${l.label}`;
        const amounts = lineMonthly(stored.monthly, l.mask, sign, max);
        const pyAmounts = storedPY ? lineMonthly(storedPY.monthly, l.mask, sign, 12) : [];
        const hits: Hit[] = [];
        for (let M = 1; M <= max; M++) {
          const series = amounts.slice(0, M);
          const pySame = pyAmounts.length >= M ? pyAmounts[M - 1] : null;
          const base = trendFlags(series, [], series[M - 1] ?? null, pySame);
          // Same seasonal / lumpy adjustment as the per-property page + export.
          const f = seasonalTrendFlags(sec.role, l, M, series[M - 1] ?? 0, base);
          if (f.length) { hits.push({ period: M, flags: f }); flaggedPeriods.add(M); }
        }
        if (hits.length) hitsByLine.set(lineKey, { section: sec.name, line: l.label, hits });
      }
    }

    // Pass 2: only for months that actually have flags, pull that month's
    // statement (for per-month actual/budget/variance) + notes + dismissals.
    type PeriodData = {
      amounts: Map<string, { actual: number; budget: number | null; variance: number | null }>;
      notes: Record<string, string>;
      dismissed: Set<string>;
    };
    const perPeriod = new Map<number, PeriodData>();
    await Promise.all([...flaggedPeriods].map(async (P) => {
      const stmtP = P === max ? statementMax : computeStatement({
        mapping, propertyName: name, year, period: P,
        gl: summaryForPeriod(stored.monthly, P),
        budgetLookup: budget ? makeBudgetLookup(budget, P) : undefined,
      });
      const amounts = new Map<string, { actual: number; budget: number | null; variance: number | null }>();
      for (const sec of stmtP.sections) {
        for (const l of sec.lines) {
          amounts.set(`${sec.name}::${l.label}`, { actual: l.periodActual, budget: l.periodBudget, variance: l.periodVariance });
        }
      }
      const [{ notes }, dismissedArr] = await Promise.all([
        getNotesBundle(m.key, year, P),
        getDismissedFlags(m.key, year, P),
      ]);
      perPeriod.set(P, { amounts, notes, dismissed: new Set(dismissedArr) });
    }));

    // Assemble, dropping dismissed (line, month) instances.
    const lines: ReviewLine[] = [];
    let flaggedMonthCount = 0;
    for (const [lineKey, { section, line, hits }] of hitsByLine) {
      const months: ReviewMonth[] = [];
      for (const h of hits) {
        const pp = perPeriod.get(h.period);
        if (!pp || pp.dismissed.has(lineKey)) continue;
        const a = pp.amounts.get(lineKey);
        months.push({
          period: h.period, monthLabel: MONTHS[h.period - 1], flags: h.flags,
          actual: a?.actual ?? 0, budget: a?.budget ?? null, variance: a?.variance ?? null,
          note: pp.notes[lineKey] ?? null,
        });
      }
      if (months.length) {
        months.sort((a, b) => a.period - b.period);
        lines.push({ lineKey, section, line, months });
        flaggedMonthCount += months.length;
      }
    }
    // Most-flagged lines first, then alphabetical.
    lines.sort((a, b) => b.months.length - a.months.length || a.line.localeCompare(b.line));

    properties.push({
      key: m.key, propertyCode: m.propertyCode, propertyName: name, hasData: true,
      latestPeriod: max, latestMonthLabel: MONTHS[max - 1], monthsCovered: max,
      lines, flaggedMonthCount, issues, tieOut, coverage,
    });
  }

  const totals = {
    flaggedMonthCount: properties.reduce((s, p) => s + p.flaggedMonthCount, 0),
    issueCount: properties.reduce((s, p) => s + p.issues.length, 0),
    propertiesWithIssues: properties.filter((p) => p.issues.length > 0).length,
    tieOutIssues: properties.filter((p) => (p.tieOut?.mismatches ?? 0) > 0).length,
    coverageGaps: properties.filter((p) => p.coverage?.behind).length,
  };
  return { year, generatedAt: new Date().toISOString(), properties, totals };
}
