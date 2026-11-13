import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { computeMonths, computeOneMonth } from "./autoProcess";
import { emptyLedger, finalizeMonth, applyRecognized, type CarryoverLedger } from "./carryover";
import type { GLParseResult, GLTransaction } from "./glParser";
import { SHARED_OFFICE_NAME, SHARED_SQFT, monthsOfPeriod, sharedOfficeAmounts, withSharedOffice, trueUpLabel, isSharedName } from "./sharedOffice";
import { officeRentalFor } from "./sharedOfficeLoad";
import { ALLOC_PCT } from "@/lib/properties/data";

// Owner, 11/2026: Nancy's 116 SF (business parks), Harry's 180 (shopping
// centres), Greg's 210 and the 96 SF conference room (every property) of LIK's
// office are shared, so that share of 2010's Office Rental (rent + electric)
// is billed back each month, by whose space it is.

const OFFICE_SF = 4000;
const RENT = 6424; // a month's rent + electric on 8110

const tx = (date: string, code: string, net: number, suffix: "9301" | "9302" | "9303" = "9301"): GLTransaction => ({
  accountCode: `${code}-${suffix}`, accountSuffix: suffix, accountName: `Acct ${code}`,
  date, description: "", jrn: "", ref: "", debit: net, credit: 0, net,
});
const ytd = (through: number): GLParseResult => {
  const txs: GLTransaction[] = [];
  for (let m = 1; m <= through; m++) txs.push(tx(`${m}/15/2026`, "8220", 1000));
  return { statementMonth: `2026-01_to_2026-${String(through).padStart(2, "0")}`, periodText: "", periodEndDate: "", transactions: txs, accountTotals: new Map() };
};
function send(ledger: CarryoverLedger, gl: GLParseResult) {
  const r = computeMonths(gl, ledger);
  if ("error" in r) throw new Error(r.error);
  let led = ledger;
  for (const m of r.months) led = finalizeMonth(led, m.statementMonth, m.expenses, "T").ledger;
  led = applyRecognized(led, r.recognizedUpdates, "T");
  return { ledger: led, r };
}

describe("the shared office's share of 2010 Office Rental", () => {
  it("splits by whose space it is", () => {
    expect(SHARED_SQFT).toBe(602);
    const a = Object.fromEntries(sharedOfficeAmounts(RENT, OFFICE_SF).map((x) => [x.suffix, x.amount]));
    expect(a["9301"]).toBeCloseTo(RENT * 116 / OFFICE_SF, 2);
    expect(a["9302"]).toBeCloseTo(RENT * 180 / OFFICE_SF, 2);
    expect(a["9303"]).toBeCloseTo(RENT * 306 / OFFICE_SF, 2);
    expect(sharedOfficeAmounts(0, OFFICE_SF)).toEqual([]);
    expect(sharedOfficeAmounts(RENT, 0)).toEqual([]);
  });

  it("bills every building on 8990, beside a 2000 account of the same number", () => {
    const gl: GLParseResult = {
      statementMonth: "2026-10", periodText: "October 2026", periodEndDate: "2026-10-31", transactions: [],
      accountTotals: new Map([["8990-9301", { accountCode: "8990-9301", accountName: "Other G&A", accountSuffix: "9301", netTotal: 100 }]]),
    };
    const withIt = withSharedOffice(gl, [{ month: "2026-10", officeRental: RENT, officeSqft: OFFICE_SF }]);
    expect(withIt.accountTotals.get("8990-9301")?.netTotal).toBe(100); // the 2000 account untouched
    const c = computeOneMonth(withIt, emptyLedger());
    if ("error" in c) throw new Error(c.error);
    const shared = c.rows.filter((r) => r.accountName === SHARED_OFFICE_NAME);
    const total = shared.reduce((s, r) => s + r.allocAmount, 0);
    // Every dollar of the shared part lands (each suffix's shares sum to 1).
    expect(total).toBeCloseTo(RENT * 602 / OFFICE_SF, 0);
    // A business park gets Nancy's + its share of Greg's and the conference room.
    const b8 = shared.filter((r) => r.propertyId === "4080").reduce((s, r) => s + r.allocAmount, 0);
    expect(b8).toBeCloseTo(RENT * 116 / OFFICE_SF * ALLOC_PCT["4080"]["9301"] + RENT * 306 / OFFICE_SF * ALLOC_PCT["4080"]["9303"], 1);
    // A shopping centre gets Harry's + its share of the rest — never Nancy's.
    expect(shared.some((r) => r.propertyId === "2300" && r.accountSuffix === "9301")).toBe(false);
    expect(shared.every((r) => r.accountCode.startsWith("8990-"))).toBe(true);
    // Idempotent: a GL that already carries it is not given it twice.
    expect(withSharedOffice(withIt, [{ month: "2026-10", officeRental: RENT, officeSqft: OFFICE_SF }])).toBe(withIt);
  });

  it("rides a year-to-date GL into its month, and a late 2010 is a true-up — never twice", () => {
    let led = emptyLedger();
    for (let m = 1; m <= 9; m++) led = send(led, ytd(m)).ledger;
    // October sent before 2010 was posted: no shared office yet.
    const oct = send(led, withSharedOffice(ytd(10), []));
    expect(oct.r.months.map((m) => m.statementMonth)).toEqual(["2026-10"]);
    // 2010 posts October: the re-run bills only the shared office, as a true-up.
    const late = send(oct.ledger, withSharedOffice(ytd(10), [{ month: "2026-10", officeRental: RENT, officeSqft: OFFICE_SF }]));
    expect(late.r.months).toEqual([]);
    expect(late.r.catchup?.total ?? 0).toBeGreaterThan(0);
    // And again: nothing left to bill.
    const again = send(late.ledger, withSharedOffice(ytd(10), [{ month: "2026-10", officeRental: RENT, officeSqft: OFFICE_SF }]));
    expect(again.r.months).toEqual([]);
    expect(again.r.catchup).toBeNull();
  });

  it("reads 2010's 8110 for a posted month only", () => {
    const gl = { monthly: { "8110-0000": [0, 0, 0, 0, 0, 0, 0, 0, 0, 5924, 0, 0], "8110-9800": [0, 0, 0, 0, 0, 0, 0, 0, 0, 500, 0, 0], "8190-0000": [0, 0, 0, 0, 0, 0, 0, 0, 0, 99, 0, 0] }, maxPeriodInFile: 10 } as never;
    expect(officeRentalFor(gl, 10)).toBe(6424);
    expect(officeRentalFor(gl, 11)).toBeNull();
    expect(officeRentalFor(null, 10)).toBeNull();
    expect(monthsOfPeriod("2026-11_to_2027-01")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("rides the year-to-date true-up on November's invoices — no invoices of its own, never twice", () => {
    const tu = { intoMonth: "2026-11", months: Array.from({ length: 9 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, officeRental: RENT, officeSqft: OFFICE_SF })) };
    expect(trueUpLabel(tu.months.map((m) => m.month))).toBe("January – September 2026");
    const nov = (m: number) => ({ month: "2026-11", officeRental: RENT, officeSqft: OFFICE_SF, _m: m });
    let led = emptyLedger();
    for (let m = 1; m <= 10; m++) led = send(led, ytd(m)).ledger;
    // November's send: one invoice per property, carrying its own month AND the true-up.
    const first = send(led, withSharedOffice(ytd(11), [nov(11)], tu));
    expect(first.r.months.map((m) => m.statementMonth)).toEqual(["2026-11"]);
    const novC = first.r.months[0];
    const shared = novC.rows.filter((r) => isSharedName(r.accountName));
    const total = shared.reduce((s, r) => s + r.allocAmount, 0);
    expect(total).toBeCloseTo(10 * RENT * 602 / OFFICE_SF, 0); // November + nine months
    expect(shared.some((r) => r.accountName.includes("January – September 2026 true-up"))).toBe(true);
    // A later year-to-date import that lays it in again bills nothing more.
    const again = send(first.ledger, withSharedOffice(ytd(11), [nov(11)], tu));
    expect(again.r.months).toEqual([]);
    expect(again.r.catchup).toBeNull();
  });
});
