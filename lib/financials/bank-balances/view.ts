// The bank-balance view: each line's accounts and balance, the reserve held
// back against it, and what is left — net available cash. The reserve is the
// Cash Analysis's own (the budget's Big Projects over the next three months,
// or the figure typed over it on the Cash Sheet), keyed the same way, so the
// two views can never disagree about it. A security-deposit line reserves its
// whole balance: it is tenants' money.

import "server-only";
import { bigProjectsReserveFor } from "@/lib/financials/cash-sheet/reserves";
import { getMonth } from "@/lib/financials/cash-sheet/store";
import { monthKey } from "@/lib/financials/cash-sheet/util";
import { BANK_ACCOUNTS } from "@/lib/properties/data";
import { BALANCE_ACCOUNTS, BALANCE_GROUPS, accountId, entityFor, type BalanceGroup } from "./entities";
import { loadBalances, type StoredBalance } from "./store";
import { listLoans } from "@/lib/debt/storage";
import { summarizeLoan, monthlyOutlay } from "@/lib/debt/amortization";

// A fund's loan is booked on its holding entity; the cash is the fund's line.
const LOAN_TO_ROW: Record<string, string> = { "3600": "PJV3", "4000": "PNIPLX" };

export type ViewAccount = {
  id: string; bank: string; last4: string; name: string; link: string | null;
  balance: number | null; available: number | null; asOf: string | null;
};
export type ViewRow = {
  key: string; name: string; group: BalanceGroup; restricted: boolean;
  accounts: ViewAccount[];
  /** Null when none of the line's accounts has been imported. */
  balance: number | null;
  reserves: number; reservesAuto: number; reservesOverridden: boolean;
  netAvailable: number | null;
  /** Outstanding loan principal today (Debt Tracker) — context, never netted
   *  out of available cash. Null when the line carries no loan. */
  debt: number | null;
  loans: { lender: string; balance: number; ratePct: number; maturity: string; status: string; nextDate: string | null; nextOutlay: number | null }[];
};
export type BalanceView = {
  ym: string;
  rows: ViewRow[];
  groups: BalanceGroup[];
  /** Imported balances that match no known account — never dropped silently. */
  unmatched: StoredBalance[];
  /** Loan principal whose property has no line here. */
  unplacedDebt: number;
  byBank: { bank: string; asOf: string | null; importedAt: string | null; importedBy: string | null; accounts: number }[];
};

function linkFor(last4: string): string | null {
  for (const list of Object.values(BANK_ACCOUNTS)) {
    const a = list.find((x) => x.last4 === last4);
    if (a) return a.link;
  }
  return null;
}

export async function buildBalanceView(now = new Date()): Promise<BalanceView> {
  const year = now.getFullYear(), month = now.getMonth() + 1;
  const ym = monthKey(year, month);
  const [doc, reserveData, sheet, loans] = await Promise.all([loadBalances(), bigProjectsReserveFor(year, month), getMonth(ym), listLoans().catch(() => [])]);

  const rows = new Map<string, ViewRow>();
  const known = new Set<string>();
  for (const a of BALANCE_ACCOUNTS) {
    const e = entityFor(a);
    const id = accountId(a.bank, a.last4);
    known.add(id);
    const b = doc.accounts[id];
    let row = rows.get(e.key);
    if (!row) {
      const auto = e.reserveCodes.reduce((s, c) => s + (reserveData.byCode[c.toUpperCase()] ?? 0), 0);
      const ov = sheet?.rows?.[e.key]?.reserves;
      row = {
        key: e.key, name: e.name, group: e.group, restricted: !!e.restricted, accounts: [], balance: null,
        reserves: e.restricted ? 0 : ov != null ? ov : auto, reservesAuto: auto, reservesOverridden: !e.restricted && ov != null, netAvailable: null,
        debt: null, loans: [],
      };
      rows.set(e.key, row);
    }
    if (row.accounts.some((x) => x.id === id)) continue;
    row.accounts.push({ id, bank: a.bank, last4: a.last4, name: a.accountName, link: linkFor(a.last4), balance: b?.balance ?? null, available: b?.available ?? null, asOf: b?.asOf ?? null });
  }
  for (const r of rows.values()) {
    const got = r.accounts.filter((a) => a.balance != null);
    r.balance = got.length ? Math.round(got.reduce((s, a) => s + (a.balance ?? 0), 0) * 100) / 100 : null;
    if (r.restricted) r.reserves = r.balance ?? 0;
    r.netAvailable = r.balance == null ? null : Math.round((r.balance - r.reserves) * 100) / 100;
  }

  // Debt: every loan lands on the line holding its cash.
  let unplacedDebt = 0;
  for (const loan of loans) {
    if (!loan.property) continue;
    const sm = summarizeLoan(loan);
    const balance = Math.round(sm.projectedBalance * 100) / 100;
    const row = rows.get(LOAN_TO_ROW[loan.property] ?? loan.property);
    if (!row) { unplacedDebt += balance; continue; }
    row.debt = Math.round(((row.debt ?? 0) + balance) * 100) / 100;
    row.loans.push({
      lender: loan.lender, balance, ratePct: loan.annualRatePct, maturity: loan.maturityDate, status: sm.status,
      nextDate: sm.nextPayment?.date ?? null,
      nextOutlay: sm.nextPayment ? Math.round(monthlyOutlay(loan, sm.nextPayment.payment, sm.nextPayment.date) * 100) / 100 : null,
    });
  }

  const byBankMap = new Map<string, BalanceView["byBank"][number]>();
  for (const b of Object.values(doc.accounts)) {
    const cur = byBankMap.get(b.bank) ?? { bank: b.bank, asOf: null, importedAt: null, importedBy: null, accounts: 0 };
    cur.accounts++;
    if (!cur.asOf || b.asOf > cur.asOf) cur.asOf = b.asOf;
    if (!cur.importedAt || b.importedAt > cur.importedAt) { cur.importedAt = b.importedAt; cur.importedBy = b.importedBy; }
    byBankMap.set(b.bank, cur);
  }

  const order = (g: BalanceGroup) => BALANCE_GROUPS.indexOf(g);
  return {
    ym,
    rows: [...rows.values()].sort((a, b) => order(a.group) - order(b.group) || a.key.localeCompare(b.key)),
    groups: [...BALANCE_GROUPS],
    unplacedDebt,
    unmatched: Object.entries(doc.accounts).filter(([id]) => !known.has(id)).map(([, b]) => b),
    byBank: [...byBankMap.values()].sort((a, b) => a.bank.localeCompare(b.bank)),
  };
}
