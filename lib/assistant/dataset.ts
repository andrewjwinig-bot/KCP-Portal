// Cross-property, multi-year statement datasets — the shape a real question has.
//
// The assistant could already pull ONE property's line items for ONE year
// (`get_statement_detail`). Anything wider had to be assembled by calling it
// once per property per year: "management salaries as a % of NOI across every
// property for the last 3 years" is ~30 × 3 = 90 calls, past any sane turn
// limit — so the assistant said it couldn't, which was true of the tools it had
// rather than of the data.
//
// This assembles the whole matrix in ONE pass, in code. Every figure is summed
// from statement lines the engine already computed; nothing is estimated and
// nothing is asked of the model except which lines it wants.
//
// WHICH LINES MATCHED IS PART OF THE ANSWER. "Non-reimbursable management and
// leasing salaries" is not a GL account — it is a phrase that has to be
// resolved to real line labels, and a total whose composition is invisible is
// a number nobody can check. So every result carries the matched labels back,
// and a property where nothing matched is reported as `null` (no such line)
// rather than as $0 (a line that exists and is empty) — the two mean opposite
// things when you are looking for what a building spends.

/** One statement line as the compute engine produced it. */
export type DatasetLine = { label: string; ytdActual: number; ytdBudget?: number | null };
export type DatasetSection = { name: string; role: string; lines: DatasetLine[] };

/** One property-year the caller has already loaded. */
export type DatasetYear = {
  propertyCode: string;
  propertyName: string;
  year: number;
  /** Latest period the GL covers — a 3-year comparison is only fair if this
   *  is the same across years, so it travels with every cell. */
  throughPeriod: number;
  sections: DatasetSection[];
  noi: number;
  revenue: number;
};

export type LineFilter = {
  /** Case-insensitive substrings; a line matches if it contains ANY of them. */
  include: string[];
  /** Case-insensitive substrings that veto a match, applied after `include`.
   *  This is how "non-reimbursable" gets expressed: match the salary lines,
   *  then drop the ones that are reimbursed. */
  exclude?: string[];
  /** Restrict to sections with these roles (e.g. ["opex"] to ignore a
   *  similarly-named revenue line). */
  roles?: string[];
};

const norm = (s: string) => (s ?? "").toLowerCase();

/** Does a line match? Exported so the caller can explain a match to a person. */
export function lineMatches(section: DatasetSection, line: DatasetLine, f: LineFilter): boolean {
  if (f.roles?.length && !f.roles.map(norm).includes(norm(section.role))) return false;
  const hay = `${norm(section.name)} ${norm(line.label)}`;
  const inc = f.include.map(norm).filter(Boolean);
  if (!inc.length) return false;
  if (!inc.some((p) => hay.includes(p))) return false;
  return !(f.exclude ?? []).map(norm).filter(Boolean).some((p) => hay.includes(p));
}

export type DatasetCell = {
  year: number;
  /** Summed actual of the matching lines. NULL when NO line matched — which
   *  is not the same as zero, and must not read as "they spend nothing". */
  amount: number | null;
  noi: number;
  revenue: number;
  /** amount ÷ NOI. Null when the amount is null, OR when NOI is zero or
   *  negative: a ratio against a loss is a number with no meaning, and
   *  printing one is how a table gets quoted back at you. */
  pctOfNoi: number | null;
  pctOfRevenue: number | null;
  throughPeriod: number;
  /** The exact line labels this cell summed. */
  matched: string[];
};

export type DatasetRow = {
  propertyCode: string;
  propertyName: string;
  cells: DatasetCell[];
};

export type Dataset = {
  rows: DatasetRow[];
  years: number[];
  /** Every distinct line label matched anywhere, so the answer can say what
   *  it counted without listing it per row. */
  matchedLines: string[];
  /** Properties where nothing matched in ANY year — surfaced, never dropped,
   *  because a missing row reads as "no spend" instead of "not found". */
  unmatchedProperties: string[];
  /** True when the years do not share a through-period, so a comparison is
   *  not apples-to-apples. */
  periodsAligned: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number, d: number): number | null =>
  d > 0 ? Math.round((n / d) * 10000) / 100 : null;

export function buildDataset(input: DatasetYear[], filter: LineFilter): Dataset {
  const years = [...new Set(input.map((d) => d.year))].sort((a, b) => a - b);
  const byProperty = new Map<string, DatasetYear[]>();
  for (const d of input) {
    const list = byProperty.get(d.propertyCode) ?? [];
    list.push(d);
    byProperty.set(d.propertyCode, list);
  }

  const allMatched = new Set<string>();
  const unmatchedProperties: string[] = [];
  const rows: DatasetRow[] = [];

  for (const [code, list] of byProperty) {
    const name = list[0]?.propertyName ?? code;
    let anyMatch = false;
    const cells: DatasetCell[] = years.map((year) => {
      const d = list.find((x) => x.year === year);
      if (!d) {
        return { year, amount: null, noi: 0, revenue: 0, pctOfNoi: null, pctOfRevenue: null, throughPeriod: 0, matched: [] };
      }
      const matched: string[] = [];
      let amount = 0;
      for (const s of d.sections) {
        for (const l of s.lines) {
          if (!lineMatches(s, l, filter)) continue;
          matched.push(l.label);
          amount += l.ytdActual;
        }
      }
      if (matched.length) { anyMatch = true; matched.forEach((m) => allMatched.add(m)); }
      return {
        year,
        amount: matched.length ? round2(amount) : null,
        noi: round2(d.noi),
        revenue: round2(d.revenue),
        pctOfNoi: matched.length ? pct(amount, d.noi) : null,
        pctOfRevenue: matched.length ? pct(amount, d.revenue) : null,
        throughPeriod: d.throughPeriod,
        matched,
      };
    });
    if (anyMatch) rows.push({ propertyCode: code, propertyName: name, cells });
    else unmatchedProperties.push(code);
  }

  rows.sort((a, b) => a.propertyCode.localeCompare(b.propertyCode));
  const periods = new Set(input.map((d) => d.throughPeriod).filter((p) => p > 0));
  return {
    rows,
    years,
    matchedLines: [...allMatched].sort(),
    unmatchedProperties: unmatchedProperties.sort(),
    periodsAligned: periods.size <= 1,
  };
}
