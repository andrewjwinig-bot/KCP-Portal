// Operating Statements — cross-property "flags to investigate" review.
//
// Sweeps every mapped property, computes its statement at its latest uploaded
// month, and collects the lines that trip a "?" trend flag (amount jump vs
// recent months, or vs the same month last year) — excluding the ones staff
// have dismissed. The result is one concentrated list across the portfolio, the
// same flags shown per-property on the statement page, so the accountant can be
// handed a single review sheet.

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

export type ReviewLine = {
  key: string;
  propertyCode: string;
  propertyName: string;
  period: number;
  monthLabel: string;
  section: string;
  line: string;
  flags: string[];
  periodActual: number;
  periodBudget: number | null;
  periodVariance: number | null;
  ytdActual: number;
  ytdBudget: number | null;
  ytdVariance: number | null;
  note: string | null;
};

export type ReviewResult = {
  year: number;
  generatedAt: string;
  /** Per-property: latest month reviewed + how many flags it has. */
  properties: { key: string; propertyCode: string; propertyName: string; period: number; monthLabel: string; flagged: number; hasData: boolean }[];
  flagged: ReviewLine[];
};

function propertyName(key: string, fallback: string): string {
  return PROPERTY_DEFS.find((p) => p.id === key)?.name ?? fallback;
}

/** Collect every active "?" flagged line across all properties for `year`. */
export async function reviewFlaggedLines(year: number): Promise<ReviewResult> {
  const [mappings, fulls] = await Promise.all([availableStatements(), listFullGls()]);
  const flagged: ReviewLine[] = [];
  const properties: ReviewResult["properties"] = [];

  for (const m of mappings) {
    const stored = assembleGls(fulls.filter((g) => g.key === m.key && g.year === year));
    const name = propertyName(m.key, m.entityName);
    if (!stored) {
      properties.push({ key: m.key, propertyCode: m.propertyCode, propertyName: name, period: 0, monthLabel: "—", flagged: 0, hasData: false });
      continue;
    }
    const storedPY = assembleGls(fulls.filter((g) => g.key === m.key && g.year === year - 1));
    const period = stored.maxPeriodInFile;
    const gl = summaryForPeriod(stored.monthly, period);
    const mapping = await getMapping(m.key);
    if (!mapping) continue;
    const budget = await resolvePropertyBudget(m.propertyCode, year);
    const budgetLookup = budget ? makeBudgetLookup(budget, period) : undefined;
    const statement = computeStatement({ mapping, propertyName: name, year, period, gl, budgetLookup });
    const dismissed = new Set(await getDismissedFlags(m.key, year, period));
    const { notes } = await getNotesBundle(m.key, year, period);

    let count = 0;
    for (const sec of statement.sections) {
      const sign = sec.role === "revenue" || sec.role === "reimbursement" ? -1 : 1;
      for (const l of sec.lines) {
        const lineKey = `${sec.name}::${l.label}`;
        if (dismissed.has(lineKey)) continue;
        const amounts = lineMonthly(stored.monthly, l.mask, sign, period);
        const pyAmounts = storedPY ? lineMonthly(storedPY.monthly, l.mask, sign, 12) : [];
        const pySame = pyAmounts.length >= period ? pyAmounts[period - 1] : null;
        const f = trendFlags(amounts, [], amounts[period - 1] ?? null, pySame);
        if (!f.length) continue;
        count++;
        flagged.push({
          key: m.key, propertyCode: m.propertyCode, propertyName: name, period, monthLabel: MONTHS[period - 1],
          section: sec.name, line: l.label, flags: f,
          periodActual: l.periodActual, periodBudget: l.periodBudget, periodVariance: l.periodVariance,
          ytdActual: l.ytdActual, ytdBudget: l.ytdBudget, ytdVariance: l.ytdVariance,
          note: notes[lineKey] ?? null,
        });
      }
    }
    properties.push({ key: m.key, propertyCode: m.propertyCode, propertyName: name, period, monthLabel: MONTHS[period - 1], flagged: count, hasData: true });
  }

  // Biggest dollar swings first.
  flagged.sort((a, b) => Math.abs(b.periodVariance ?? 0) - Math.abs(a.periodVariance ?? 0));
  return { year, generatedAt: new Date().toISOString(), properties, flagged };
}
