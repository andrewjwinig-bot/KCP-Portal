// The balance sheet itself: GL account balances → assets, liabilities and
// partners' capital, with the proof that it balances.
//
// WHY THIS TIES BY CONSTRUCTION, and is not a schedule of estimates:
//
// A general ledger is double-entry, so every account balance signed the way the
// GL signs it sums to zero across the whole trial balance. Assets carry debit
// (positive) balances; liabilities, capital and revenue carry credit (negative)
// ones. Splitting that identity gives the balance sheet for free:
//
//     0 = ΣAssets + ΣLiabilities + ΣCapital + ΣProfitAndLoss
//     ΣAssets = (−ΣLiabilities) + (−ΣCapital) + (−ΣProfitAndLoss)
//              = Liabilities + Partners' capital + Net income for the period
//
// So "Net income (loss) for the period" is not a plug — it is the P&L accounts'
// own net, and including it is exactly what makes assets equal liabilities plus
// capital. If the two sides disagree, an account is misclassified or the GL is
// partial, and the page says so rather than balancing itself.
//
// A balance is the year's opening plus every net through the as-of month, NOT
// the YTD Total column — so any month can be asked for, not just December. The
// GL's own YTD Total is used to cross-check December (glParser's reconcileGl
// already asserts opening + Σnets == the reported ending per account).

import { classifyAccount, isProfitAndLoss, BS_GROUPS, type BsGroupDef, type BsSection } from "./classify";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** The slice of a stored GL a balance sheet needs. */
export interface BsGl {
  /** account → Beginning Balance. REQUIRED: without it a balance-sheet account
   *  shows only the year's activity, which is not a balance. */
  beginning?: Record<string, number>;
  /** account → 12 monthly nets (Jan–Dec). */
  monthly: Record<string, number[]>;
  /** account → the GL's own "YTD Total" (ending balance), for cross-checking. */
  ytdTotal?: Record<string, number>;
  /** account → name from the GL header row. */
  names?: Record<string, string>;
  maxPeriodInFile?: number;
  /** Last month of the report range. */
  coverageEnd?: number;
  /** First month the data covers — the month the opening balance applies to. */
  coverageStartMonth?: number;
}

export interface BsAccountRow {
  code: string;
  name: string;
  /** The GL's own signed balance (assets positive, liabilities/capital negative). */
  signed: number;
  /** The figure as it reads on the sheet (liabilities and capital flipped positive). */
  amount: number;
}

export interface BsGroupRow extends BsGroupDef {
  accounts: BsAccountRow[];
  total: number;
}

export interface BalanceSheet {
  key: string;
  year: number;
  /** 1–12; the sheet is "as of" the last day of this month. */
  asOfMonth: number;
  asOfDate: string;
  assets: BsGroupRow[];
  liabilities: BsGroupRow[];
  /** Partners' capital groups. Net income is separate, below. */
  equity: BsGroupRow[];
  totalAssets: number;
  totalLiabilities: number;
  /** Capital accounts + net income for the period. */
  totalEquity: number;
  /** Net income (loss) for the period, income positive. */
  netIncome: number;
  totalLiabilitiesAndEquity: number;
  /** Accounts with a balance that nothing recognised. They are EXCLUDED from
   *  the sheet and are exactly the difference when it does not balance. */
  unclassified: BsAccountRow[];
  proof: {
    assets: number;
    liabilitiesAndEquity: number;
    /** assets − (liabilities + equity). Zero on a complete, classified GL. */
    difference: number;
    balances: boolean;
  };
  coverage: { startMonth: number; through: number; asOfCovered: boolean };
  /** Anything that makes the sheet unsafe to hand over, in plain words. */
  warnings: string[];
  /** True when nothing prevents this being certified — no warnings, it balances. */
  usable: boolean;
}

/** A single account's balance: the opening plus every net through `month`. */
export function balanceAt(gl: BsGl, code: string, month: number): number {
  const begin = gl.beginning?.[code] ?? 0;
  const nets = gl.monthly[code] ?? [];
  let sum = begin;
  for (let i = 0; i < month && i < 12; i++) sum += nets[i] || 0;
  return round2(sum);
}

/** Every account appearing anywhere in the GL. */
function allAccounts(gl: BsGl): string[] {
  const set = new Set<string>([
    ...Object.keys(gl.monthly ?? {}),
    ...Object.keys(gl.beginning ?? {}),
    ...Object.keys(gl.ytdTotal ?? {}),
  ]);
  return [...set].sort();
}

export function computeBalanceSheet(
  gl: BsGl,
  opts: { key: string; year: number; asOfMonth?: number; overrides?: Record<string, string> },
): BalanceSheet {
  const { key, year, overrides } = opts;
  const coverageEnd = gl.coverageEnd ?? gl.maxPeriodInFile ?? 12;
  const asOfMonth = Math.min(12, Math.max(1, opts.asOfMonth ?? coverageEnd ?? 12));
  const startMonth = gl.coverageStartMonth ?? 1;
  const warnings: string[] = [];

  // A balance sheet without opening balances is not a balance sheet — every
  // figure would be the year's movement instead of the balance. Say so rather
  // than rendering a confident wrong number.
  const hasOpenings = !!gl.beginning && Object.keys(gl.beginning).length > 0;
  if (!hasOpenings) {
    warnings.push(
      "This GL upload carries no Beginning Balances, so no account balance can be " +
      "derived — only the year's activity. Re-export the General Ledger with the " +
      "beginning balance column and upload it again.",
    );
  }
  if (asOfMonth > coverageEnd) {
    warnings.push(
      `The GL covers through month ${coverageEnd}; a balance sheet as of month ${asOfMonth} ` +
      "would be missing the months in between.",
    );
  }
  if (startMonth > 1) {
    warnings.push(
      `This GL opens at month ${startMonth}, so it carries no balances for the months ` +
      "before it. Upload the full year.",
    );
  }

  const byGroup = new Map<string, BsAccountRow[]>();
  const unclassified: BsAccountRow[] = [];
  let plSigned = 0;

  for (const code of allAccounts(gl)) {
    const name = gl.names?.[code] ?? "";
    const signed = balanceAt(gl, code, asOfMonth);

    if (isProfitAndLoss(code)) { plSigned += signed; continue; }

    const g = classifyAccount(code, name, overrides);
    if (!g) {
      // A zero-balance stranger is noise, not a problem — a dormant account.
      if (Math.abs(signed) >= 0.005) unclassified.push({ code, name, signed, amount: signed });
      continue;
    }
    if (Math.abs(signed) < 0.005 && !gl.beginning?.[code]) continue; // dormant
    const amount = g.section === "asset" ? signed : -signed;
    (byGroup.get(g.key) ?? byGroup.set(g.key, []).get(g.key)!).push({ code, name, signed, amount });
  }

  const rowsFor = (section: BsSection): BsGroupRow[] =>
    BS_GROUPS.filter((g) => g.section === section)
      .sort((a, b) => a.order - b.order)
      .map((g) => {
        const accounts = (byGroup.get(g.key) ?? []).sort((a, b) => a.code.localeCompare(b.code));
        return { ...g, accounts, total: round2(accounts.reduce((s, a) => s + a.amount, 0)) };
      })
      .filter((g) => g.accounts.length > 0);

  const assets = rowsFor("asset");
  const liabilities = rowsFor("liability");
  const equity = rowsFor("equity");

  // Revenue is credit-normal and expense debit-normal, so the P&L accounts'
  // signed sum is (expenses − revenue) — the negative of net income.
  const netIncome = round2(-plSigned);

  const totalAssets = round2(assets.reduce((s, g) => s + g.total, 0));
  const totalLiabilities = round2(liabilities.reduce((s, g) => s + g.total, 0));
  const capitalTotal = round2(equity.reduce((s, g) => s + g.total, 0));
  const totalEquity = round2(capitalTotal + netIncome);
  const totalLiabilitiesAndEquity = round2(totalLiabilities + totalEquity);
  const difference = round2(totalAssets - totalLiabilitiesAndEquity);
  const balances = Math.abs(difference) < 0.5;

  if (unclassified.length) {
    warnings.push(
      `${unclassified.length} account${unclassified.length === 1 ? "" : "s"} with a balance ` +
      "could not be placed on the sheet and are excluded. Assign them before sending this out.",
    );
  }
  if (hasOpenings && !balances) {
    warnings.push(
      `The sheet is out of balance by ${difference.toLocaleString("en-US", { style: "currency", currency: "USD" })}. ` +
      "On a complete ledger this is zero, so an account is misclassified or the GL is partial.",
    );
  }

  return {
    key, year, asOfMonth,
    asOfDate: `${year}-${String(asOfMonth).padStart(2, "0")}-${new Date(Date.UTC(year, asOfMonth, 0)).getUTCDate()}`,
    assets, liabilities, equity,
    totalAssets, totalLiabilities, totalEquity, netIncome, totalLiabilitiesAndEquity,
    unclassified,
    proof: { assets: totalAssets, liabilitiesAndEquity: totalLiabilitiesAndEquity, difference, balances },
    coverage: { startMonth, through: coverageEnd, asOfCovered: asOfMonth <= coverageEnd },
    warnings,
    usable: warnings.length === 0 && balances,
  };
}
