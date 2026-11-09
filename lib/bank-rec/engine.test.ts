import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reconcileAccount, carryForward, seedFromSkylineRec } from "./engine";
import { parseBankStatement, parseSkylineRec, type CheckingAccount } from "./monthFiles";
import { itemizeStatement } from "./statementItems";

const fx = (n: string) => readFileSync(join(__dirname, "__fixtures__", n), "utf8");
const stmtOf = (n: string, l4?: string) => {
  const t = fx(n); const st = parseBankStatement(t, l4); const it = itemizeStatement(t, st);
  return { ending: st.ending!, beginning: st.beginning, periodEnd: st.periodEnd, items: it.ok ? it.items : null, itemizeError: it.ok ? null : it.reason };
};
const acct = (beginning: number, txns: [string, string, string, number][]): CheckingAccount => {
  let bal = beginning;
  return {
    key: "JPM 7200", bankName: "", inactive: false, beginning, ownership: [],
    txns: txns.map(([d, ref, desc, amt]) => { bal = Math.round((bal + amt) * 100) / 100; return { dateISO: d, ref, description: desc, amount: amt, balance: bal }; }),
    get balance() { return bal; },
  } as CheckingAccount;
};

// Elbridge x1692, September 2026 — Skyline's lines exactly as Marie's Rec1 cleared them.
const elbridgeBook = () => acct(312781.22, [
  ["2026-09-01", "RECEIPTS", "CR batch 197, Prop/Co. 7200", 20452.29],
  ["2026-09-02", "022950", "LIK Management-Clearing", -849.81],
  ["2026-09-15", "022951", "LIK Management-Clearing", -855.52],
  ["2026-09-23", "022952", "Korman Commercial Properties", -1091],
  ["2026-09-25", "CREDIT", "September PHL U&O Pmt", -2246],
]);

describe("one account, one month", () => {
  it("ties Elbridge's September line for line, as Marie's Skyline rec did", () => {
    const r = reconcileAccount({ period: "2026-09", periodEnd: "2026-09-30", statement: stmtOf("chase-1692.txt"), book: elbridgeBook(), carried: [] });
    expect(r.status).toBe("ok");
    expect(r.difference).toBe(0);
    expect(r.statementBalance).toBe(328191.18);
    expect(r.openBook).toEqual([]);
    expect(r.cleared.filter((c) => c.how === "check")).toHaveLength(3);
  });

  it("names the check, vendor, date and amount when a check is keyed wrong", () => {
    const book = acct(312781.22, [
      ["2026-09-01", "RECEIPTS", "CR batch 197, Prop/Co. 7200", 20452.29],
      ["2026-09-02", "022950", "LIK Management-Clearing", -849.81],
      ["2026-09-15", "022951", "LIK Management-Clearing", -858.52],
      ["2026-09-23", "022952", "Korman Commercial Properties", -1091],
      ["2026-09-25", "CREDIT", "September PHL U&O Pmt", -2246],
    ]);
    const r = reconcileAccount({ period: "2026-09", periodEnd: "2026-09-30", statement: stmtOf("chase-1692.txt"), book, carried: [] });
    expect(r.status).toBe("out");
    expect(r.difference).toBe(3);
    expect(r.issues[0]).toBe("Out of balance by $3.00");
    expect(r.mismatches).toEqual([{ checkNo: "22951", dateISO: "2026-09-15", description: "LIK Management-Clearing", book: -858.52, bank: -855.52 }]);
    expect(r.issues.join(" ")).toMatch(/Check 22951 \(LIK Management-Clearing\): Skyline \$858\.52, bank \$855\.52/);
  });

  it("an outstanding check is an Unreconciled Transaction, carried, and clears the next month", () => {
    const book = acct(312781.22, [
      ["2026-09-01", "RECEIPTS", "CR batch 197, Prop/Co. 7200", 20452.29],
      ["2026-09-02", "022950", "LIK Management-Clearing", -849.81],
      ["2026-09-15", "022951", "LIK Management-Clearing", -855.52],
      ["2026-09-23", "022952", "Korman Commercial Properties", -1091],
      ["2026-09-25", "CREDIT", "September PHL U&O Pmt", -2246],
      ["2026-09-29", "022953", "Borough of Bellmawr", -500],
    ]);
    const sep = reconcileAccount({ period: "2026-09", periodEnd: "2026-09-30", statement: stmtOf("chase-1692.txt"), book, carried: [] });
    expect(sep.status).toBe("ok");
    expect(sep.openBook.map((x) => [x.ref, x.description, x.amount])).toEqual([["022953", "Borough of Bellmawr", -500]]);
    expect(sep.adjustedStatementBalance).toBe(sep.adjustedCheckBookBalance);

    const carried = carryForward(sep, new Set());
    const oct = reconcileAccount({
      period: "2026-10", periodEnd: "2026-10-31",
      statement: { ending: 327691.18, beginning: 328191.18, periodEnd: "2026-10-31", items: [{ dateISO: "2026-10-06", amount: -500, checkNo: "22953", description: "Check 22953", kind: "check" }] },
      book: acct(327691.18, []), carried,
    });
    expect(oct.status).toBe("ok");
    expect(oct.openBook).toEqual([]);
    expect(oct.cleared[0].book[0].origin).toBe("2026-09");
  });

  it("several Skyline receipt batches clear one lockbox deposit", () => {
    const book = acct(1000, [
      ["2026-09-08", "RECEIPTS", "CR batch 234, Prop/Co. 4080", 18988.83],
      ["2026-09-08", "RECEIPTS", "CR batch 234, Prop/Co. 4060", 16903.41],
      ["2026-09-08", "RECEIPTS", "CR batch 234, Prop/Co. 40B0", 4040.75],
      ["2026-09-08", "RECEIPTS", "CR batch 234, Prop/Co. 4070", 4402.85],
      ["2026-09-08", "RECEIPTS", "CR batch 234, Prop/Co. 4050", 1253.43],
    ]);
    const r = reconcileAccount({
      period: "2026-09", periodEnd: "2026-09-30",
      statement: { ending: 46589.27, beginning: 1000, periodEnd: "2026-09-30", items: [{ dateISO: "2026-09-08", amount: 45589.27, checkNo: null, description: "Lockbox No: 22162 For 9 Items", kind: "deposit" }] },
      book, carried: [],
    });
    expect(r.status).toBe("ok");
    expect(r.cleared[0]).toMatchObject({ how: "group" });
    expect(r.cleared[0].book).toHaveLength(5);
  });

  it("a fee on the bank and not on the books is called out with its detail", () => {
    const r = reconcileAccount({
      period: "2026-09", periodEnd: "2026-09-30",
      statement: { ending: 845, beginning: 1000, periodEnd: "2026-09-30", items: [{ dateISO: "2026-09-03", amount: -155, checkNo: null, description: "Account Analysis Settlement Charge", kind: "fee" }] },
      book: acct(1000, []), carried: [],
    });
    expect(r.status).toBe("attention");
    expect(r.difference).toBe(0);
    expect(r.openBank.map((x) => [x.dateISO, x.description, x.amount])).toEqual([["2026-09-03", "Account Analysis Settlement Charge", -155]]);
  });

  it("an unexplained gap is OUT OF BALANCE, by the dollar", () => {
    const r = reconcileAccount({
      period: "2026-09", periodEnd: "2026-09-30",
      statement: { ending: 1000, beginning: 1000, periodEnd: "2026-09-30", items: [] },
      book: { ...acct(1000, []), balance: 1250 } as CheckingAccount, carried: [],
    });
    expect(r.status).toBe("out");
    expect(r.difference).toBe(-250);
    expect(r.issues[0]).toBe("Out of balance by -$250.00");
  });

  it("an off-cycle money-market statement holds its lines after month end for next month", () => {
    const s = stmtOf("liberty-7216.txt", "x7216");
    const r = reconcileAccount({ period: "2026-09", periodEnd: "2026-09-30", statement: s, book: acct(154189.55, [["2026-09-17", "67", "Refund", -1475]]), carried: [] });
    expect(r.deferredBank.map((x) => x.amount)).toEqual([52.08]);
    expect(r.statementBalance).toBe(152714.55);
    expect(r.status).toBe("ok");
  });

  it("seeds a first month from Marie's prior Skyline rec", () => {
    const rec = parseSkylineRec(fx("rec-2190-rec2.txt"));
    const seeded = seedFromSkylineRec(rec.unreconciled, (iso) => iso.slice(0, 7));
    expect(seeded.map((s) => [s.origin, s.amount])).toEqual([["2025-12", -135410.52], ["2026-09", -50]]);
  });
});
