// THE PORTFOLIO CASH FORECAST (owner: "how much can we distribute, and
// when"). Every bank line's balance today, rolled MONTH BY MONTH to Dec 31 on
// its reprojection's cash flow after debt service (debt is already in that
// figure), less the distributions still planned — the same roll the
// Reprojections tile and the budget draft's Projected Bank Balance use
// (`rollFromDate`), kept month by month here. Pure: the route reads the banks,
// the GLs and the reprojections.

export type ForecastLineInput = {
  key: string;
  name: string;
  group: string;
  /** Today's balance and the date it is as of (the oldest of its accounts). */
  balance: number | null;
  asOf: string | null;
  /** Tenant money (security deposits): shown, never in the totals. */
  restricted?: boolean;
  /** The reprojection's monthly cash flow after debt service — null when the
   *  line has no statement (it is carried flat and says why). */
  cashFlow: number[] | null;
  /** Planned distributions by month, and what the GL already shows paid. */
  plan?: number[];
  paidOnGl?: number[];
  /** Why the line is carried flat, when it is. */
  flatReason?: string;
};

export type ForecastLine = {
  key: string; name: string; group: string; restricted: boolean;
  balance: number | null; asOf: string | null;
  /** Balance at each month end, Jan–Dec; null before the as-of month. */
  monthEnds: (number | null)[];
  /** Cash flow after debt service from the as-of date to Dec 31. */
  cashFlowRest: number;
  /** Distributions still to be paid this year (a positive figure), by month. */
  distributions: number[];
  distributionsRest: number;
  yearEnd: number | null;
  /** True when nothing moves the balance (no statement, or not this year). */
  flat: boolean;
  flatReason: string | null;
};

const r0 = (n: number) => Math.round(n);

function parseAsOf(asOf: string | null): { y: number; mi: number; day: number } | null {
  const m = asOf ? /^(\d{4})-(\d{2})-(\d{2})/.exec(asOf) : null;
  return m ? { y: Number(m[1]), mi: Number(m[2]) - 1, day: Number(m[3]) } : null;
}

/** One line, month by month. The as-of month takes only its remaining days'
 *  share of the month's cash flow, and its distribution only if the GL has not
 *  already shown it paid — exactly `rollFromDate`. */
export function forecastLine(input: ForecastLineInput, year: number): ForecastLine {
  const base: ForecastLine = {
    key: input.key, name: input.name, group: input.group, restricted: !!input.restricted,
    balance: input.balance, asOf: input.asOf,
    monthEnds: new Array(12).fill(null), cashFlowRest: 0,
    distributions: new Array(12).fill(0), distributionsRest: 0,
    yearEnd: input.balance, flat: true, flatReason: input.flatReason ?? null,
  };
  if (input.balance == null) return { ...base, flatReason: base.flatReason ?? "Not imported" };
  const d = parseAsOf(input.asOf);
  const startMi = d && d.y === year ? d.mi : d && d.y < year ? -1 : 12;
  // Carried flat: the month-ends from the as-of month on all read today's balance.
  const flatEnds = () => base.monthEnds.map((_, i) => (i >= Math.max(0, startMi) ? input.balance : null));
  if (!input.cashFlow) return { ...base, monthEnds: flatEnds(), flatReason: base.flatReason ?? "No operating statement" };
  if (!d || d.y !== year) return { ...base, monthEnds: flatEnds(), flatReason: `Balance is not as of ${year}` };

  const plan = input.plan ?? new Array(12).fill(0);
  const paid = input.paidOnGl ?? new Array(12).fill(0);
  const dim = new Date(Date.UTC(year, d.mi + 1, 0)).getUTCDate();
  const ends: (number | null)[] = new Array(12).fill(null);
  const dist = new Array(12).fill(0);
  let bal = input.balance, flow = 0;
  for (let i = d.mi; i < 12; i++) {
    const cf = i === d.mi ? ((dim - d.day) / dim) * (input.cashFlow[i] || 0) : input.cashFlow[i] || 0;
    const out = i === d.mi && Math.abs(paid[i] || 0) >= 0.5 ? 0 : plan[i] || 0;
    dist[i] = out;
    flow += cf;
    bal += cf - out;
    ends[i] = r0(bal);
  }
  const distributionsRest = dist.reduce((s, x) => s + x, 0);
  return {
    ...base,
    monthEnds: ends,
    cashFlowRest: r0(flow),
    distributions: dist.map(r0),
    distributionsRest: r0(distributionsRest),
    yearEnd: r0(input.balance + flow - distributionsRest),
    flat: false,
    flatReason: null,
  };
}

export type ForecastTotals = {
  today: number;
  monthEnds: (number | null)[];
  cashFlowRest: number;
  distributionsRest: number;
  distributions: number[];
  yearEnd: number;
};

/** Totals over the lines that count (restricted money left out). A month-end
 *  carries a line still waiting for its as-of month at today's balance, so
 *  every column is the whole portfolio. */
export function totalsOf(lines: ForecastLine[]): ForecastTotals {
  const counted = lines.filter((l) => !l.restricted && l.balance != null);
  const monthEnds: (number | null)[] = new Array(12).fill(null);
  const first = counted.reduce((m, l) => {
    const i = l.monthEnds.findIndex((x) => x != null);
    return i >= 0 ? Math.min(m, i) : m;
  }, 12);
  for (let i = first; i < 12; i++) {
    monthEnds[i] = r0(counted.reduce((s, l) => s + (l.monthEnds[i] ?? l.balance ?? 0), 0));
  }
  const distributions = new Array(12).fill(0);
  for (const l of counted) l.distributions.forEach((x, i) => { distributions[i] += x; });
  return {
    today: r0(counted.reduce((s, l) => s + (l.balance ?? 0), 0)),
    monthEnds,
    cashFlowRest: r0(counted.reduce((s, l) => s + l.cashFlowRest, 0)),
    distributionsRest: r0(counted.reduce((s, l) => s + l.distributionsRest, 0)),
    distributions,
    yearEnd: r0(counted.reduce((s, l) => s + (l.yearEnd ?? 0), 0)),
  };
}

/** The statement(s) whose reprojection drives a bank line. A fund line reads
 *  its consolidated statement; Eastwick's one account banks two ventures; a
 *  line with none (clearing, the parent, tenant deposits) is carried flat. */
export function statementKeysFor(lineKey: string, mappings: Set<string>): string[] {
  if (lineKey === "EASTWICK") return ["1500", "9200"].filter((k) => mappings.has(k));
  if (lineKey === "3610A") return mappings.has("CONDO") ? ["CONDO"] : [];
  if (lineKey === "2010-CLR" || lineKey.startsWith("SD-")) return [];
  return mappings.has(lineKey) ? [lineKey] : [];
}
