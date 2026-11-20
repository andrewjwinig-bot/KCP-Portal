// NNN QUOTE FOR A VACANT SUITE (owner, 11/2026: "make it easier for him to
// quote NNNs to prospective tenants … select the suite, input the base rent
// that he is quoting and then it should populate est CAM, INS, RET … and find
// the 'all in' number"; "right now he comes to me and asks me what NNNs would
// be for a specific space"). Pure: the property's recoverable pools and GLA in,
// the suite's estimated charges out — the same pools ÷ GLA the budget draft's
// "NNN / SF" tile shows, so Harry's quote and the budget agree.
//
// A pro-rata estimate: a new lease's own terms (a stipulated share, a cap, an
// exclusion, a RET discount) are not known yet, so none are applied. The CAM
// admin fee is an input, defaulting to what the centre's leases carry.

export type Pools = { cam: number; ins: number; ret: number };

export type NnnLine = { key: "base" | "cam" | "admin" | "ins" | "ret"; label: string; psf: number; annual: number; monthly: number };

export type NnnQuote = {
  sqft: number;
  sharePct: number;
  lines: NnnLine[];
  nnnPsf: number; nnnMonthly: number; nnnAnnual: number;
  allInPsf: number; allInMonthly: number; allInAnnual: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The suite's estimate: pools times (suite SF ÷ GLA), admin fee % on CAM. */
export function quoteNnn(pools: Pools, gla: number, sqft: number, baseRentPsf: number, adminPct: number): NnnQuote | null {
  if (!(gla > 0) || !(sqft > 0)) return null;
  const share = sqft / gla;
  const line = (key: NnnLine["key"], label: string, annual: number): NnnLine =>
    ({ key, label, annual: r2(annual), monthly: r2(annual / 12), psf: r2(annual / sqft) });
  const cam = pools.cam * share;
  const lines: NnnLine[] = [
    line("base", "Base rent", baseRentPsf * sqft),
    line("cam", "CAM", cam),
    ...(adminPct > 0 ? [line("admin", `CAM admin fee (${adminPct}%)`, cam * adminPct / 100)] : []),
    line("ins", "Insurance", pools.ins * share),
    line("ret", "Real estate taxes", pools.ret * share),
  ];
  const nnn = lines.filter((l) => l.key !== "base");
  const sum = (ls: NnnLine[], f: (l: NnnLine) => number) => r2(ls.reduce((s, l) => s + f(l), 0));
  return {
    sqft, sharePct: share * 100, lines,
    nnnPsf: sum(nnn, (l) => l.psf), nnnMonthly: sum(nnn, (l) => l.monthly), nnnAnnual: sum(nnn, (l) => l.annual),
    allInPsf: sum(lines, (l) => l.psf), allInMonthly: sum(lines, (l) => l.monthly), allInAnnual: sum(lines, (l) => l.annual),
  };
}

export type NnnYear = { year: number; kind: "actual" | "reprojection" | "budget"; cam: number; ins: number; ret: number; total: number;
  /** A year missing a category's actual (the seed has no INS / RET for it). */
  partial?: boolean };

/** Each year's pools as $/SF of ONE GLA (today's), so the trend is the cost
 *  moving, not the denominator. */
export function nnnTrend(years: { year: number; kind: NnnYear["kind"]; pools: Partial<Pools> }[], gla: number): NnnYear[] {
  if (!(gla > 0)) return [];
  return years
    .map(({ year, kind, pools }) => {
      const cam = (pools.cam ?? 0) / gla, ins = (pools.ins ?? 0) / gla, ret = (pools.ret ?? 0) / gla;
      return { year, kind, cam: r2(cam), ins: r2(ins), ret: r2(ret), total: r2(cam + ins + ret),
        ...(pools.ins == null || pools.ret == null ? { partial: true } : {}) };
    })
    .sort((a, b) => a.year - b.year);
}

/** The admin fee most of the centre's leases carry (0 when none). */
export function typicalAdminFee(pcts: (number | null | undefined)[]): number {
  const n = new Map<number, number>();
  for (const p of pcts) if (p != null && p > 0) n.set(p, (n.get(p) ?? 0) + 1);
  let best = 0, count = 0;
  for (const [p, c] of n) if (c > count || (c === count && p > best)) { best = p; count = c; }
  return best;
}
