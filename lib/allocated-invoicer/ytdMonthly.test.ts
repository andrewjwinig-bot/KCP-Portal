import { describe, it, expect } from "vitest";
import { computeMonths } from "./autoProcess";
import { emptyLedger, finalizeMonth, applyRecognized, type CarryoverLedger } from "./carryover";
import type { GLParseResult, GLTransaction } from "./glParser";

// The owner's routine (10/20/26): "every month im going to run the YTD General
// Ledger and import it … in case any prior period charges come through … i
// dont want to double count things". A Jan → latest GL each month must bill
// ONLY the new month, plus a true-up for charges posted late to a billed month.

const tx = (date: string, code: string, net: number): GLTransaction => ({
  accountCode: `${code}-9301`, accountSuffix: "9301", accountName: `Acct ${code}`,
  date, description: "", jrn: "", ref: "", debit: net, credit: 0, net,
});
const ytd = (through: number, extra: GLTransaction[] = []): GLParseResult => {
  const txs: GLTransaction[] = [];
  for (let m = 1; m <= through; m++) txs.push(tx(`${m}/15/2026`, "8220", 1000));
  txs.push(...extra);
  return { statementMonth: `2026-01_to_2026-${String(through).padStart(2, "0")}`, periodText: "", periodEndDate: "", transactions: txs, accountTotals: new Map() };
};
/** What a send commits (sendAllocation's commit, without the mail). */
function send(ledger: CarryoverLedger, gl: GLParseResult): { ledger: CarryoverLedger; months: string[]; catchup: number; catchup4080: number; total: number } {
  const r = computeMonths(gl, ledger);
  if ("error" in r) throw new Error(r.error);
  let led = ledger;
  for (const m of r.months) led = finalizeMonth(led, m.statementMonth, m.expenses, "T").ledger;
  led = applyRecognized(led, r.recognizedUpdates, "T");
  return { ledger: led, months: r.months.map((m) => m.statementMonth), catchup: r.catchup?.total ?? 0, catchup4080: r.catchup?.byProperty.find((b) => b.code === "4080")?.amount ?? 0, total: r.total };
}

describe("a year-to-date GL every month", () => {
  it("bills only the new month, then only the late charge — never a month twice", () => {
    let led = emptyLedger();
    for (let m = 1; m <= 9; m++) led = send(led, ytd(m)).ledger; // Jan … Sep, one month each

    const same = send(led, ytd(9)); // re-importing September's YTD: nothing new
    expect(same.months).toEqual([]);
    expect(same.total).toBe(0);

    // October's YTD, with a $500 charge posted late to March.
    const oct = send(led, ytd(10, [tx("3/20/2026", "8220", 500)]));
    expect(oct.months).toEqual(["2026-10"]);
    expect(oct.catchup4080).toBeCloseTo(500 * 0.238, 2); // 4080's share of the late charge, as a true-up

    // November's YTD: October and the March charge are both already billed.
    const nov = send(oct.ledger, ytd(11, [tx("3/20/2026", "8220", 500)]));
    expect(nov.months).toEqual(["2026-11"]);
    expect(nov.catchup).toBe(0);
  });
});
