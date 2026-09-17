import { describe, it, expect } from "vitest";
import { reconcile, groupBookItems, bankCheckNo, type BankTxn, type BookTxn } from "./reconcile";

// Synthetic data (no real figures) that mirrors the real mechanics:
//  - a check split across two invoice lines (5002)
//  - a receipt batch split across several charge lines (one deposit)
//  - a check that clears on the bank as an AvidPay ACH with the check # in the
//    description (5002 → "REF*CK*5002*")
//  - an outstanding check that never clears (5003)
//  - bank-only items (a service fee and interest) that aren't in the books yet
const book: BookTxn[] = [
  { date: "2026-06-02", ref: "5001", vendor: "Acme Supply", description: "", amount: -100 },
  { date: "2026-06-03", ref: "5002", vendor: "Utility Co", description: "gas", amount: -60 },
  { date: "2026-06-03", ref: "5002", vendor: "Utility Co", description: "electric", amount: -40 },
  { date: "2026-06-20", ref: "5003", vendor: "Roofer LLC", description: "", amount: -250 }, // outstanding
  { date: "2026-06-10", ref: "PMT.", description: "RNT to A", amount: 30 },
  { date: "2026-06-10", ref: "PMT.", description: "CAM to A", amount: 70 },
  { date: "2026-06-10", ref: "PMT.", description: "RNT to B", amount: 100 },
  { date: "2026-06-25", ref: "U&O", description: "June U&O Pmt", amount: -50 },
];
const bank: BankTxn[] = [
  { date: "2026-06-04", amount: -100, checkNo: "5001", description: "CHECK 5001", type: "CHECK_PAID" },
  { date: "2026-06-05", amount: -100, checkNo: null, description: "AVIDPAY SERVICE REF*CK*5002*260603*Utility", type: "ACH_DEBIT" },
  { date: "2026-06-10", amount: 200, checkNo: "12", description: "REMOTE ONLINE DEPOSIT # 12", type: "CHECK_DEPOSIT" },
  { date: "2026-06-25", amount: -50, checkNo: null, description: "ORIG CO NAME:PHILA DEPT REV TAX PYMT", type: "ACH_DEBIT" },
  { date: "2026-06-15", amount: -8, checkNo: null, description: "MONTHLY SERVICE FEE", type: "FEE" },
  { date: "2026-06-30", amount: 5, checkNo: null, description: "INTEREST PAYMENT", type: "ACH_CREDIT" },
];
const STATEMENT_END = 9947; // bank ending
const BOOK_END = 9700;      // GL cash ending (begin 10,000 + net −300)

describe("bank reconciliation engine", () => {
  it("groups split checks and receipt batches into single items", () => {
    const items = groupBookItems(book);
    const c5002 = items.find((i) => i.checkNo === "5002");
    expect(c5002?.amount).toBe(-100);           // −60 + −40
    const deposit = items.find((i) => i.amount === 200);
    expect(deposit).toBeTruthy();               // 30 + 70 + 100 grouped
    expect(items.filter((i) => i.checkNo).length).toBe(3); // 5001, 5002, 5003
  });

  it("extracts the check # embedded in an AvidPay ACH description", () => {
    expect(bankCheckNo(bank[1])).toBe("5002");
    expect(bankCheckNo(bank[0])).toBe("5001");
    expect(bankCheckNo(bank[4])).toBeNull();     // the fee has no check
  });

  it("matches by check #, then by amount+date; leaves the rest as exceptions", () => {
    const r = reconcile(book, bank, STATEMENT_END, BOOK_END);
    expect(r.matched.map((m) => m.book.checkNo ?? m.book.label).sort()).toEqual(
      ["5001", "5002", "June U&O Pmt", "RNT to A"].sort(), // deposit labelled by first line
    );
    expect(r.outstandingChecks.map((o) => o.checkNo)).toEqual(["5003"]);
    expect(r.depositsInTransit).toHaveLength(0);
    expect(r.bankOnly.map((b) => b.description).sort()).toEqual(["INTEREST PAYMENT", "MONTHLY SERVICE FEE"]);
  });

  it("ties out: adjusted bank == adjusted book (after booking the fee/interest)", () => {
    const r = reconcile(book, bank, STATEMENT_END, BOOK_END);
    expect(r.adjustedBank).toBe(9697);  // 9947 − 250 outstanding
    expect(r.adjustedBook).toBe(9697);  // 9700 − 8 fee + 5 interest
    expect(r.difference).toBe(0);
    expect(r.inBalance).toBe(true);
  });

  it("flags a real out-of-balance when a book entry is missing", () => {
    // Drop the U&O payment from the books → the bank ACH becomes a bank-only
    // exception and the books read $50 higher than they should.
    const r = reconcile(book.filter((t) => t.ref !== "U&O"), bank, STATEMENT_END, BOOK_END);
    expect(r.bankOnly.some((b) => /PHILA DEPT REV/.test(b.description))).toBe(true);
    expect(r.inBalance).toBe(false);
  });
});
