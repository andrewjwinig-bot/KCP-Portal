/**
 * A BOOK'S ROLL-UP — "All Shopping Centers" — is the sum of its properties'
 * drafts, line by line. Nothing is budgeted here: every figure is a property's,
 * so the roll-up is read-only and a change is made on the property.
 *
 * Lines are matched by SECTION name + LABEL (the statement mapping names them
 * alike across a book); a line one property lacks is simply absent from its
 * sum. Each line keeps its per-property split (`byProperty`) — the roll-up's
 * line detail is "which properties make up this figure", not a history.
 */
import type { BudgetDraft, BudgetDraftLine, BudgetDraftSection, BudgetSubLine } from "./draft";

const r0 = (n: number) => Math.round(n);
const add = (a: number[], b: number[]) => a.map((v, i) => v + (b?.[i] || 0));
const zero = () => new Array(12).fill(0) as number[];

export type PropertyShare = { code: string; name: string; months: number[]; total: number };

function mergeSubs(into: BudgetSubLine[], from: BudgetSubLine[] | undefined): BudgetSubLine[] {
  for (const x of from ?? []) {
    const hit = into.find((y) => y.account === x.account);
    if (!hit) { into.push({ ...x, months: x.months.slice(), typed: undefined, typeable: false, items: x.items ? mergeSubs([], x.items) : undefined }); continue; }
    hit.months = add(hit.months, x.months);
    hit.total += x.total || 0;
    hit.basisTotal = (hit.basisTotal ?? 0) + (x.basisTotal ?? 0);
    if (x.prior != null) hit.prior = (hit.prior ?? 0) + x.prior;
    if (x.items) hit.items = mergeSubs(hit.items ?? [], x.items);
  }
  return into;
}

export function consolidateDrafts(name: string, drafts: BudgetDraft[]): BudgetDraft | null {
  if (!drafts.length) return null;
  const first = drafts[0];
  const sections: BudgetDraftSection[] = [];
  for (const d of drafts) {
    for (const sec of d.sections) {
      let s = sections.find((x) => x.name === sec.name);
      if (!s) { s = { ...sec, lines: [], subtotal: zero(), total: 0 }; sections.push(s); }
      for (const l of sec.lines) {
        let line = s.lines.find((x) => x.label === l.label) as (BudgetDraftLine & { byProperty?: PropertyShare[] }) | undefined;
        if (!line) {
          line = { ...l, months: zero(), total: 0, basisTotal: 0, typed: undefined, subLines: undefined, pool: undefined, inputKind: undefined, feePct: undefined, byProperty: [] };
          s.lines.push(line);
        }
        line.months = add(line.months, l.months);
        line.total += l.total || 0;
        line.basisTotal += l.basisTotal || 0;
        if (l.subLines?.length) line.subLines = mergeSubs(line.subLines ?? [], l.subLines);
        if (Math.abs(l.total || 0) >= 0.5) line.byProperty!.push({ code: d.propertyCode, name: d.propertyName, months: l.months.slice(), total: r0(l.total) });
      }
    }
  }
  for (const s of sections) {
    for (const l of s.lines) { l.months = l.months.map(r0); l.total = r0(l.total); l.basisTotal = r0(l.basisTotal); }
    s.subtotal = s.lines.reduce((a, l) => add(a, l.months), zero()).map(r0);
    s.total = r0(s.subtotal.reduce((a, v) => a + v, 0));
  }
  const roll = (k: keyof BudgetDraft["rollups"]) => {
    const months = drafts.reduce((a, d) => add(a, d.rollups[k].months), zero()).map(r0);
    return { months, total: r0(months.reduce((a, v) => a + v, 0)) };
  };
  // A fund's loan appears once per building, each carrying its share — the
  // roll-up puts the shares back together into the one loan.
  const loans: NonNullable<BudgetDraft["debt"]>["loans"] = [];
  for (const l of drafts.flatMap((d) => d.debt?.loans ?? [])) {
    const hit = loans.find((x) => x.id === l.id);
    if (!hit) { loans.push({ ...l }); continue; }
    hit.interest += l.interest; hit.principal += l.principal;
    if (hit.share != null || l.share != null) hit.share = (hit.share ?? 0) + (l.share ?? 0);
  }
  for (const l of loans) if (l.share != null && l.share > 0.999) delete l.share;
  return {
    propertyCode: "ALL",
    propertyName: name,
    budgetYear: first.budgetYear,
    basisYear: first.basisYear,
    growthPct: first.growthPct,
    sections,
    rollups: { totalRevenues: roll("totalRevenues"), totalOperatingExpenses: roll("totalOperatingExpenses"), netOperatingIncome: roll("netOperatingIncome") },
    // Every suite in the book — occupancy is the book's.
    tenantRevenue: drafts.flatMap((d) => d.tenantRevenue ?? []),
    debt: loans.length ? {
      loans,
      interest: r0(drafts.reduce((a, d) => a + (d.debt?.interest ?? 0), 0)),
      principal: r0(drafts.reduce((a, d) => a + (d.debt?.principal ?? 0), 0)),
    } : undefined,
    consolidated: { properties: drafts.map((d) => ({ code: d.propertyCode, name: d.propertyName })) },
    cash: consolidateCash(drafts),
  };
}

/** The book's cash: every property's distributions and bank balance, summed —
 *  each property's balance already rolls its own opening forward. */
export function consolidateCash(drafts: BudgetDraft[]): BudgetDraft["cash"] {
  const withCash = drafts.filter((d) => d.cash);
  if (!withCash.length) return undefined;
  const dist = withCash.reduce((a, d) => add(a, d.cash!.distributions.months), zero()).map(r0);
  const actual = withCash.reduce((a, d) => add(a, d.cash!.distributions.basisYearActual), zero()).map(r0);
  const gls = withCash.map((d) => d.cash!.gl).filter(Boolean);
  const month = gls.length ? Math.min(...gls.map((g) => g!.month)) : 0;
  const yearEnds = withCash.map((d) => d.cash!.projectedYearEnd);
  return {
    gl: gls.length ? { balance: r0(gls.reduce((a, g) => a + g!.balance, 0)), year: gls[0]!.year, month, accounts: [] } : null,
    projectedYearEnd: yearEnds.some((v) => v != null) ? r0(yearEnds.reduce((a: number, v) => a + (v ?? 0), 0)) : null,
    opening: r0(withCash.reduce((a, d) => a + d.cash!.opening, 0)),
    openingTyped: withCash.some((d) => d.cash!.openingTyped),
    distributions: { months: dist, total: r0(dist.reduce((a, v) => a + v, 0)), source: dist.some((v) => v) ? "plan" : "none", basisYearActual: actual },
    balance: withCash.reduce((a, d) => add(a, d.cash!.balance), zero()).map(r0),
    byProperty: withCash.map((d) => ({ code: d.propertyCode, name: d.propertyName, opening: d.cash!.opening, distributions: d.cash!.distributions.total, yearEnd: d.cash!.balance[11] })),
  };
}
