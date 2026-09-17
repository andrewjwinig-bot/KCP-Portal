// Bank reconciliation engine.
//
// Two sides:
//   • BOOK  — the GL cash account's transactions (0110-0000), pulled from the
//             operating-statement GL store: date, ref (check # / journal), amount.
//   • BANK  — the bank statement's cleared transactions (imported CSV).
//
// The engine groups the book side into logical items (a check split across
// several invoice lines is one item; a receipt batch is one item), matches them
// against cleared bank transactions by check number then amount, and produces a
// classic two-sided reconciliation:
//
//   Adjusted bank  = statement balance + deposits-in-transit − outstanding checks
//   Adjusted book  = GL ending balance + bank-only adjustments (fees, interest)
//   In balance     ⟺ adjusted bank == adjusted book
//
// Anything that doesn't match — a bank item with no book entry (a fee, interest,
// an unexpected debit), or an amount mismatch — surfaces as an exception to
// investigate, Flags-to-Investigate style.

/** A cleared transaction from the bank statement (parsed from the CSV). */
export type BankTxn = {
  date: string;            // ISO YYYY-MM-DD
  amount: number;          // signed: debits negative, credits positive
  checkNo: string | null;  // from the "Check or Slip #" column, when present
  description: string;
  type?: string;           // e.g. CHECK_PAID, ACH_DEBIT, CHECK_DEPOSIT
};

/** One raw GL line on the cash account. */
export type BookTxn = {
  date: string | null;     // ISO YYYY-MM-DD
  ref: string;             // "Check # / Jnl Ref": a check number or a journal tag
  vendor?: string;
  description: string;
  amount: number;          // signed
};

/** A grouped book item (a whole check, or a whole receipt batch). */
export type BookItem = {
  key: string;
  checkNo: string | null;
  date: string | null;
  label: string;
  amount: number;
};

export type ReconResult = {
  statementEnd: number;
  bookEnd: number;
  matched: { book: BookItem; bank: BankTxn }[];
  outstandingChecks: BookItem[]; // book disbursements that haven't cleared
  depositsInTransit: BookItem[]; // book deposits not yet on the statement
  bankOnly: BankTxn[];           // bank items with no book match (fees/interest/flags)
  adjustedBank: number;
  adjustedBook: number;
  difference: number;            // adjustedBank − adjustedBook (0 ⇒ ties)
  inBalance: boolean;
};

const cents = (n: number) => Math.round(n * 100);
const eqMoney = (a: number, b: number) => cents(a) === cents(b);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** A numeric-looking ref is a check number. */
function isCheckRef(ref: string): boolean {
  return /^\d{3,}$/.test(ref.trim());
}

/** Extract the effective check number for a bank transaction — from the check
 *  column, or embedded in the description (AvidPay ACH debits carry the check
 *  number as "CK101220" / "REF*CK*101220*"). */
export function bankCheckNo(b: BankTxn): string | null {
  if (b.checkNo && /^\d{3,}$/.test(b.checkNo.trim())) return b.checkNo.trim();
  const m = b.description.match(/REF\*CK\*(\d{3,})/i) || b.description.match(/\bCK\s?(\d{3,})\b/i);
  return m ? m[1] : null;
}

/** Group raw GL cash lines into logical items: all lines sharing a check number
 *  become one item (a check split across invoices); non-check journal lines are
 *  grouped by ref + date (a receipt batch posted on one day). */
export function groupBookItems(txns: BookTxn[]): BookItem[] {
  const groups = new Map<string, BookItem>();
  for (const t of txns) {
    const ref = (t.ref ?? "").trim();
    const check = isCheckRef(ref);
    const key = check ? `chk:${ref}` : `${ref || "je"}|${t.date ?? ""}`;
    const existing = groups.get(key);
    if (existing) {
      existing.amount = round2(existing.amount + t.amount);
    } else {
      groups.set(key, {
        key,
        checkNo: check ? ref : null,
        date: t.date,
        label: t.vendor?.trim() || t.description?.trim() || (check ? `Check ${ref}` : ref) || "Journal entry",
        amount: t.amount,
      });
    }
  }
  return [...groups.values()];
}

/** Reconcile book (GL) vs bank. `dateWindowDays` bounds the amount-only fallback
 *  match (default 8 days) so a same-amount coincidence far apart doesn't match. */
export function reconcile(
  bookTxns: BookTxn[],
  bankTxns: BankTxn[],
  statementEnd: number,
  bookEnd: number,
  opts: { dateWindowDays?: number } = {},
): ReconResult {
  const windowMs = (opts.dateWindowDays ?? 8) * 86_400_000;
  const items = groupBookItems(bookTxns);
  const usedBook = new Set<string>();
  const usedBank = new Set<number>();
  const matched: { book: BookItem; bank: BankTxn }[] = [];

  // Pass 1 — check number + amount (the strong signal).
  bankTxns.forEach((bank, bi) => {
    const bc = bankCheckNo(bank);
    if (!bc) return;
    const hit = items.find((it) => !usedBook.has(it.key) && it.checkNo === bc && eqMoney(it.amount, bank.amount));
    if (hit) { matched.push({ book: hit, bank }); usedBook.add(hit.key); usedBank.add(bi); }
  });

  // Pass 2 — amount + close date, for items without a usable check number
  // (deposits, ACH like the U&O payment).
  bankTxns.forEach((bank, bi) => {
    if (usedBank.has(bi)) return;
    const bt = Date.parse(bank.date);
    const hit = items.find((it) => {
      if (usedBook.has(it.key) || !eqMoney(it.amount, bank.amount)) return false;
      if (!it.date || Number.isNaN(bt)) return true; // amount-only when a date is missing
      return Math.abs(Date.parse(it.date) - bt) <= windowMs;
    });
    if (hit) { matched.push({ book: hit, bank }); usedBook.add(hit.key); usedBank.add(bi); }
  });

  const unmatchedBook = items.filter((it) => !usedBook.has(it.key));
  const outstandingChecks = unmatchedBook.filter((it) => it.amount < 0);
  const depositsInTransit = unmatchedBook.filter((it) => it.amount > 0);
  const bankOnly = bankTxns.filter((_, bi) => !usedBank.has(bi));

  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  // Outstanding checks carry negative amounts, deposits-in-transit positive, so
  // both fold in with their sign.
  const adjustedBank = round2(statementEnd + sum(outstandingChecks) + sum(depositsInTransit));
  // Bank-only items are adjustments the books haven't recorded yet (a −$2 fee
  // reduces book; +interest increases it).
  const adjustedBook = round2(bookEnd + sum(bankOnly));
  const difference = round2(adjustedBank - adjustedBook);

  return {
    statementEnd, bookEnd, matched, outstandingChecks, depositsInTransit, bankOnly,
    adjustedBank, adjustedBook, difference, inBalance: Math.abs(difference) < 0.005,
  };
}
