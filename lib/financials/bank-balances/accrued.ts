// Accounts nobody imports: their balance is ACCRUED from a statement anchor at
// the bank's rate — interest compounded daily on actual days, a fixed monthly
// charge out, nothing else (owner: no deposits or withdrawals). The Leonard
// Korman Trust is the one: LIK money, hands off, so it reads on the LIK line
// group with its whole balance held back from Net available. The Cash
// Analysis GL view accrues the same anchor (`LK_TRUST` is imported there), so
// re-anchoring to a new statement is ONE edit. Client-safe.

export type AccruedAccount = {
  key: string; name: string; bank: string; last4: string;
  /** Balance at the OPENING of `anchor.month` (day 1). */
  anchor: { year: number; month: number; balance: number };
  /** Annual NOMINAL rate, compounded daily (rate / 365 a day). */
  rate: number;
  /** Recurring charge taken at each month end. */
  monthlyFee: number;
};

// Liberty x9245 — the 7/3–8/5/26 statement ties exactly: 1,850,453.25 +
// 5,277.27 interest − 2.00 charge. 3.15% nominal = the statement's 3.20% APY.
export const LK_TRUST: AccruedAccount = {
  key: "LK-TRUST", name: "Leonard Korman Trust", bank: "Liberty Bank", last4: "x9245",
  anchor: { year: 2026, month: 8, balance: 1_855_728.52 }, rate: 0.0315, monthlyFee: 2,
};

export const ACCRUED_ACCOUNTS: AccruedAccount[] = [LK_TRUST];

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Balance on an ISO date (start of that day), to the cent. Before the anchor
 *  month it is the anchor itself — nothing is projected backwards. */
export function accruedBalance(a: AccruedAccount, isoDate: string): number {
  const [yy, mm, dd] = isoDate.slice(0, 10).split("-").map(Number);
  const target = yy * 12 + mm;
  let bal = a.anchor.balance;
  let y = a.anchor.year, m = a.anchor.month;
  if (target < y * 12 + m) return bal;
  while (y * 12 + m < target) {
    bal = bal * Math.pow(1 + a.rate / 365, daysIn(y, m)) - a.monthlyFee;
    if (m === 12) { y++; m = 1; } else m++;
  }
  bal *= Math.pow(1 + a.rate / 365, Math.max(0, dd - 1));
  return Math.round(bal * 100) / 100;
}
