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
};

export type ReviewResult = {
  year: number;
  generatedAt: string;
  properties: ReviewProperty[];
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
      properties.push({ key: m.key, propertyCode: m.propertyCode, propertyName: name, hasData: false, latestPeriod: 0, latestMonthLabel: "—", monthsCovered: 0, lines: [], flaggedMonthCount: 0 });
      continue;
    }
    const storedPY = assembleGls(fulls.filter((g) => g.key === m.key && g.year === year - 1));
    const max = stored.maxPeriodInFile;
    const mapping = await getMapping(m.key);
    if (!mapping) continue;
    const budget = await resolvePropertyBudget(m.propertyCode, year);

    // Enumerate the statement's lines (section ladder + masks) from the latest
    // month; masks don't change month to month.
    const statementMax = computeStatement({
      mapping, propertyName: name, year, period: max,
      gl: summaryForPeriod(stored.monthly, max),
      budgetLookup: budget ? makeBudgetLookup(budget, max) : undefined,
    });

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
          const f = trendFlags(series, [], series[M - 1] ?? null, pySame);
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
      lines, flaggedMonthCount,
    });
  }

  return { year, generatedAt: new Date().toISOString(), properties };
}
