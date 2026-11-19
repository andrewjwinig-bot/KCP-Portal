// The cash position in one place — the totals the Bank Balances page's tiles
// show, and Alison's dashboard card (owner: "alisons dashboard … a bank
// balances summary … she likes to look at that"). Pure and client-safe: both
// read the SAME function over the SAME view, so they cannot disagree.

/** The fields of a balance row the totals read (the view's `ViewRow`). */
export type SummaryRow = {
  group: string; restricted: boolean; balance: number | null; reserves: number; netAvailable: number | null;
  change: number | null; priorBalance: number | null; priorAsOf: string | null;
  debt: number | null; debtService: number | null; handsOff?: unknown;
};
type ViewRow = SummaryRow;
export type SummaryView = {
  rows: SummaryRow[]; groups: string[]; byBank: { asOf: string | null }[];
  unplacedDebt?: number; unplacedDebtService?: number; tenantCredits?: { total: number } | null;
};

export const sumRows = (rs: ViewRow[], f: (r: ViewRow) => number | null | undefined) => rs.reduce((s, r) => s + (f(r) ?? 0), 0);

/** Week over week across the rows that have a baseline. */
export function changeOf(rs: ViewRow[]) {
  const c = rs.filter((r) => r.change != null);
  if (!c.length) return { change: null as number | null, prior: null as number | null, now: null as number | null, priorAsOf: null as string | null };
  return {
    change: sumRows(c, (r) => r.change), prior: sumRows(c, (r) => r.priorBalance), now: sumRows(c, (r) => r.balance),
    priorAsOf: c.map((r) => r.priorAsOf).filter(Boolean).sort()[0] ?? null,
  };
}

export function balanceSummary(view: SummaryView) {
  const rows = view.rows ?? [];
  const operating = rows.filter((r) => !r.restricted);
  return {
    totalCash: sumRows(rows, (r) => r.balance),
    deposits: sumRows(rows.filter((r) => r.restricted), (r) => r.balance),
    reserves: sumRows(operating, (r) => (r.balance == null ? 0 : r.reserves)),
    net: sumRows(operating, (r) => r.netAvailable),
    handsOff: sumRows(rows.filter((r) => r.handsOff), (r) => r.balance),
    wow: changeOf(rows),
    debt: sumRows(rows, (r) => r.debt) + (view.unplacedDebt ?? 0),
    debtService: sumRows(rows, (r) => r.debtService) + (view.unplacedDebtService ?? 0),
    tenantCredits: view.tenantCredits?.total ?? 0,
    asOf: (view.byBank ?? []).map((b) => b.asOf).filter(Boolean).sort().pop() ?? null,
    /** Each group (Management, Business Parks …): cash, net available, and its week. */
    groups: (view.groups ?? []).map((g) => {
      const rs = rows.filter((r) => r.group === g);
      return { group: g, cash: sumRows(rs, (r) => r.balance), net: sumRows(rs.filter((r) => !r.restricted), (r) => r.netAvailable), restricted: rs.every((r) => r.restricted), change: changeOf(rs).change, n: rs.length };
    }).filter((g) => g.n),
  };
}
