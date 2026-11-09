// BANK REC ENGINE — one account, one month (owner: "build an automated bank
// rec to let me know if all are in balance and call out inbalances … track
// any open items from prior periods to carry through to the next months bank
// rec"; "if there is inbalance, we need to know the specific detail. whether
// check #, amount, vendor date, etc so we can reference and fix").
//
// BOOK = Skyline's Checking Account Report for the account (every check,
// receipt batch and entry in the month) PLUS the items still open from the
// month before. BANK = the itemized bank statement PLUS bank lines carried
// from the month before (a fee Skyline books a month late, an off-cycle
// statement's lines after month end). Matching, in order:
//   1. CHECK NUMBER (Chase / M&T AvidPay lines carry "Ck001632") — a number
//      that matches with a different amount is a MISMATCH, never two open items;
//   2. the same AMOUNT, nearest date;
//   3. GROUPS — several Skyline receipt batches into one lockbox deposit, or
//      one batch into several deposits, and finally a day's totals.
// What is left is the rec, laid out as Marie's Skyline report reads:
//   Statement Balance + Unreconciled (book items the bank has not cleared)
//     = Adjusted Statement Balance
//   Check Book Balance + bank lines not yet on the books
//     = Adjusted Check Book Balance        → In Balance when the two agree.
// Both open lists carry to the next month.
//
// Pure (no I/O).

import type { CheckingAccount } from "./monthFiles";
import type { BankItem } from "./statementItems";

export type OpenItem = {
  id: string;
  side: "book" | "bank";
  dateISO: string;
  ref: string;
  description: string;
  amount: number;
  /** The month the item first appeared in. */
  origin: string;
};

export type Mismatch = { checkNo: string; dateISO: string; description: string; book: number; bank: number };
export type ClearedPair = { book: OpenItem[]; bank: OpenItem[]; how: "check" | "amount" | "group" };

export type AccountRecInput = {
  period: string;          // "2026-10"
  periodEnd: string;       // "2026-10-31"
  statement: { ending: number; beginning: number | null; periodEnd: string | null; items: BankItem[] | null; itemizeError?: string | null } | null;
  book: CheckingAccount | null;
  carried: OpenItem[];
};

export type RecStatus = "ok" | "attention" | "out" | "incomplete";

export type AccountRec = {
  status: RecStatus;
  /** Plain reasons, worst first — what the row says. */
  issues: string[];
  statementBalance: number | null;       // bank at month end
  adjustedStatementBalance: number | null;
  checkBookBalance: number | null;       // Skyline at month end
  adjustedCheckBookBalance: number | null;
  difference: number | null;
  openBook: OpenItem[];                  // Unreconciled Transactions
  openBank: OpenItem[];                  // on the bank, not on the books
  mismatches: Mismatch[];
  cleared: ClearedPair[];
  /** Bank lines after month end (an off-cycle statement) — carried, not judged. */
  deferredBank: OpenItem[];
  itemized: boolean;
  bookProves: boolean | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const cents = (n: number) => Math.round(n * 100);
const days = (a: string, b: string) => (Date.parse(a) - Date.parse(b)) / 86400000;
const normCheck = (s: string | null | undefined) => (s && /^\d{2,9}$/.test(s.trim()) ? s.trim().replace(/^0+/, "") : null);

/** A stable id, so an open item keeps its identity (and any note) month to month. */
export function itemId(side: "book" | "bank", dateISO: string, ref: string, amount: number, description: string): string {
  const s = `${side}|${dateISO}|${ref}|${cents(amount)}|${description.toLowerCase().replace(/\s+/g, " ").slice(0, 40)}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `${side[0]}${dateISO.replace(/-/g, "")}${cents(Math.abs(amount))}-${h.toString(36)}`;
}

/** Up to 18 candidates, every subset, the one summing exactly to the target. */
function subsetSum<T extends { amount: number }>(cands: T[], target: number): T[] | null {
  const xs = cands.slice(0, 18);
  const want = cents(target);
  const n = xs.length;
  let best: T[] | null = null;
  for (let mask = 1; mask < 1 << n; mask++) {
    let s = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) s += cents(xs[i].amount);
    if (s !== want) continue;
    const pick = xs.filter((_, i) => mask & (1 << i));
    if (!best || pick.length < best.length) best = pick;
  }
  return best && best.length >= 2 ? best : null;
}

export function reconcileAccount(input: AccountRecInput): AccountRec {
  const { period, periodEnd, statement, book, carried } = input;
  const issues: string[] = [];

  const empty = (status: RecStatus, why: string): AccountRec => ({
    status, issues: [why], statementBalance: statement?.ending ?? null, adjustedStatementBalance: null,
    checkBookBalance: book?.balance ?? null, adjustedCheckBookBalance: null, difference: null,
    openBook: carried.filter((c) => c.side === "book"), openBank: carried.filter((c) => c.side === "bank"),
    mismatches: [], cleared: [], deferredBank: [], itemized: false, bookProves: null,
  });
  if (!statement) return empty("incomplete", "No bank statement filed for the month");
  if (!book) return empty("incomplete", "Not in the Skyline Checking Account Report");

  // The book register must carry itself (beginning + lines = balance).
  const bookMoved = r2(book.txns.reduce((a, t) => a + t.amount, 0));
  const bookProves = book.beginning == null ? (book.txns.length === 0 ? true : null) : Math.abs(r2(book.beginning + bookMoved) - book.balance) < 0.005;
  if (bookProves === false) issues.push(`Skyline's register does not carry: beginning $${book.beginning?.toFixed(2)} + lines $${bookMoved.toFixed(2)} ≠ balance $${book.balance.toFixed(2)}`);

  const bookItems: OpenItem[] = [
    ...carried.filter((c) => c.side === "book"),
    ...book.txns.map((t) => ({ id: itemId("book", t.dateISO, t.ref, t.amount, t.description), side: "book" as const, dateISO: t.dateISO, ref: t.ref, description: t.description, amount: t.amount, origin: period })),
  ];

  // Bank lines: the statement's, plus those carried; lines after month end wait.
  let bankItems: OpenItem[] = carried.filter((c) => c.side === "bank");
  const deferredBank: OpenItem[] = [];
  let itemized = false;
  let statementBalance = statement.ending;
  if (statement.items) {
    itemized = true;
    for (const b of statement.items) {
      const it: OpenItem = { id: itemId("bank", b.dateISO, b.checkNo ?? "", b.amount, b.description), side: "bank", dateISO: b.dateISO, ref: b.checkNo ?? "", description: b.description, amount: b.amount, origin: period };
      if (b.dateISO > periodEnd) { deferredBank.push(it); statementBalance = r2(statementBalance - b.amount); }
      else bankItems.push(it);
    }
  } else {
    issues.push(`Bank statement could not be itemized — ${statement.itemizeError ?? "unknown layout"}; checked on balances only`);
  }

  const used = new Set<string>();
  const cleared: ClearedPair[] = [];
  const mismatches: Mismatch[] = [];
  const free = <T extends OpenItem>(xs: T[]) => xs.filter((x) => !used.has(x.id));
  // Ids can repeat (two identical lines on one day) — make them unique.
  const uniq = (xs: OpenItem[]) => { const seen = new Map<string, number>(); return xs.map((x) => { const n = seen.get(x.id) ?? 0; seen.set(x.id, n + 1); return n ? { ...x, id: `${x.id}~${n}` } : x; }); };
  const B = uniq(bookItems);
  bankItems = uniq(bankItems);

  if (itemized) {
    // 1. Check number.
    for (const bk of B) {
      const no = normCheck(bk.ref);
      if (!no || bk.amount >= 0) continue;
      const bn = free(bankItems).find((x) => normCheck(x.ref) === no);
      if (!bn) continue;
      used.add(bk.id); used.add(bn.id);
      if (cents(bk.amount) !== cents(bn.amount)) mismatches.push({ checkNo: no, dateISO: bk.dateISO, description: bk.description, book: bk.amount, bank: bn.amount });
      cleared.push({ book: [bk], bank: [bn], how: "check" });
    }
    // 2. Same amount, nearest date (a carried item may be any age).
    for (const bk of free(B)) {
      const cands = free(bankItems).filter((x) => cents(x.amount) === cents(bk.amount) && days(x.dateISO, bk.dateISO) >= -10 && (bk.origin !== period || days(x.dateISO, bk.dateISO) <= 75))
        .sort((a, b) => Math.abs(days(a.dateISO, bk.dateISO)) - Math.abs(days(b.dateISO, bk.dateISO)));
      if (!cands.length) continue;
      used.add(bk.id); used.add(cands[0].id);
      cleared.push({ book: [bk], bank: [cands[0]], how: "amount" });
    }
    // 3a. Several book lines → one bank line (receipt batches into a lockbox deposit).
    for (const bn of free(bankItems).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))) {
      const cands = free(B).filter((x) => Math.sign(x.amount) === Math.sign(bn.amount) && days(bn.dateISO, x.dateISO) >= -3 && days(bn.dateISO, x.dateISO) <= 10)
        .sort((a, b) => Math.abs(days(bn.dateISO, a.dateISO)) - Math.abs(days(bn.dateISO, b.dateISO)));
      const pick = subsetSum(cands, bn.amount);
      if (!pick) continue;
      pick.forEach((p) => used.add(p.id)); used.add(bn.id);
      cleared.push({ book: pick, bank: [bn], how: "group" });
    }
    // 3b. One book line → several bank lines.
    for (const bk of free(B).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))) {
      const cands = free(bankItems).filter((x) => Math.sign(x.amount) === Math.sign(bk.amount) && days(x.dateISO, bk.dateISO) >= -3 && days(x.dateISO, bk.dateISO) <= 10)
        .sort((a, b) => Math.abs(days(a.dateISO, bk.dateISO)) - Math.abs(days(b.dateISO, bk.dateISO)));
      const pick = subsetSum(cands, bk.amount);
      if (!pick) continue;
      pick.forEach((p) => used.add(p.id)); used.add(bk.id);
      cleared.push({ book: [bk], bank: pick, how: "group" });
    }
    // 3c. A day's deposits against the next few days' deposits, as totals.
    const dates = [...new Set(free(bankItems).filter((x) => x.amount > 0).map((x) => x.dateISO))].sort();
    for (const d of dates) {
      const bankDay = free(bankItems).filter((x) => x.amount > 0 && x.dateISO === d);
      for (const back of [0, 1, 2, 3]) {
        const bookDay = free(B).filter((x) => x.amount > 0 && days(d, x.dateISO) >= 0 && days(d, x.dateISO) <= back);
        if (!bookDay.length || !bankDay.length) continue;
        if (cents(bookDay.reduce((a, x) => a + x.amount, 0)) !== cents(bankDay.reduce((a, x) => a + x.amount, 0))) continue;
        bookDay.forEach((p) => used.add(p.id)); bankDay.forEach((p) => used.add(p.id));
        cleared.push({ book: bookDay, bank: bankDay, how: "group" });
        break;
      }
    }
  }

  const openBook = free(B).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const openBank = itemized ? free(bankItems).sort((a, b) => a.dateISO.localeCompare(b.dateISO)) : bankItems;

  const sumOf = (xs: OpenItem[]) => r2(xs.reduce((a, x) => a + x.amount, 0));
  // A check keyed for a different amount than it cleared is an IMBALANCE (the
  // books are wrong by the gap) — it is listed with its number, payee and both
  // amounts, and the difference is the gap.
  const adjustedStatementBalance = r2(statementBalance + sumOf(openBook));
  const adjustedCheckBookBalance = r2(book.balance + sumOf(openBank));
  const difference = r2(adjustedStatementBalance - adjustedCheckBookBalance);

  // What needs a person, worst first.
  const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (Math.abs(difference) >= 0.005) issues.unshift(`Out of balance by ${usd(difference)}`);
  for (const m of mismatches) issues.push(`Check ${m.checkNo} (${m.description}): Skyline $${Math.abs(m.book).toFixed(2)}, bank $${Math.abs(m.bank).toFixed(2)}`);
  if (openBank.length) issues.push(`${openBank.length} bank line${openBank.length === 1 ? "" : "s"} not on the books ($${sumOf(openBank).toFixed(2)})`);
  const stale = openBook.filter((x) => days(periodEnd, x.dateISO) > 60);
  if (stale.length) issues.push(`${stale.length} open item${stale.length === 1 ? "" : "s"} over 60 days old ($${sumOf(stale).toFixed(2)})`);

  const status: RecStatus = Math.abs(difference) >= 0.005 || mismatches.length ? "out"
    : !itemized || bookProves === false ? "attention"
    : mismatches.length || openBank.length || stale.length ? "attention" : "ok";

  return {
    status, issues, statementBalance, adjustedStatementBalance, checkBookBalance: book.balance, adjustedCheckBookBalance,
    difference, openBook, openBank, mismatches, cleared, deferredBank, itemized, bookProves,
  };
}

/** What the next month starts with: everything still open, plus deferred bank lines. */
export function carryForward(rec: AccountRec, resolved: Set<string>): OpenItem[] {
  return [...rec.openBook, ...rec.openBank, ...rec.deferredBank].filter((x) => !resolved.has(x.id.replace(/~\d+$/, "")));
}

/** Seed a first month from Marie's prior-month Skyline rec (its Unreconciled Transactions). */
export function seedFromSkylineRec(items: { dateISO: string; ref: string; description: string; amount: number }[], originFor: (iso: string) => string): OpenItem[] {
  return items.map((u) => ({ id: itemId("book", u.dateISO, u.ref, u.amount, u.description), side: "book" as const, dateISO: u.dateISO, ref: u.ref, description: u.description, amount: u.amount, origin: originFor(u.dateISO) }));
}
