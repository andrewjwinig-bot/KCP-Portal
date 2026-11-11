import { describe, expect, it } from "vitest";
import { splitPall, headerCode, sectionAsFile, activityCodes, balancesThrough, balanceFingerprint, placeSections, type Row } from "./pallSplit";
import { parseGeneralLedgerMonthly, isDetailedGl } from "./glParser";

// A synthetic PALL export laid out as Skyline prints it: the header ONCE, then
// one property's accounts after another (the real file carries vendor detail
// and stays out of the repo).
const preamble: Row[] = [
  [null, "11/11/2026", null, null, null, null, null, null, null, null, "Korman Commercial Properties, Inc"],
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, "Detailed General Ledger"],
  [null, null, null, null, null, null, null, null, null, null, "Property/Company : 0800 - Interstate Business Park"],
  [null, null, null, null, null, null, null, null, null, null, "10/1/2026 To 10/31/2026"],
  ["Trans Date", null, null, null, "\nVendor Name", null, null, null, null, "Check # / Jnl Ref", null, null, "Invoice Number / Journal", null, null, null, "Invoice Description / \nJnl Description", null, null, "\nAmount"],
];
const acct = (a: string, name: string, open: number): Row => [null, a, null, null, null, name, null, null, null, null, null, null, null, null, null, null, "Beginning Balance", null, null, open];
const tx = (amount: number, inv: string, desc: string): Row => [46300, null, null, null, "Vendor", null, null, null, null, "0001", null, null, inv, null, null, null, desc, null, null, amount];
const total = (label: string, v: number): Row => [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, label, null, null, v];

const sectionA: Row[] = [
  acct("0110-0000", "Cash-Operating", 1000), tx(-50, "PR080010261", "payroll"), total("October Total", -50), total("YTD Total", 950),
  acct("6120-8501", "Electric", 300), tx(50, "AE08001026", "electric"), total("October Total", 50), total("YTD Total", 350),
];
const sectionB: Row[] = [
  acct("0110-0000", "Cash-Operating", 2500.5), tx(100, "123", "RNT to 3610-101"), tx(200, "124", "RNT to 3610-102"), tx(300, "125", "CAM to 3610-103"), total("October Total", 600), total("YTD Total", 3100.5),
  acct("4230-0000", "Rent", -9000), tx(-600, "126", "RNT to 3610-101"), total("October Total", -600), total("YTD Total", -9600),
];
const rows: Row[] = [...preamble, ...sectionA, ...sectionB];

const resolve = (c: string) => (["0800", "3610", "9800", "9820"].includes(c) ? c : null);

describe("multi-property GL (PALL)", () => {
  it("splits where the account number goes back down", () => {
    expect(isDetailedGl(rows)).toBe(true);
    const sp = splitPall(rows);
    expect(sp.sections.map((s) => s.accounts)).toEqual([2, 2]);
    expect(headerCode(sp.preamble)).toBe("0800");
    // A one-property file is one section.
    expect(splitPall([...preamble, ...sectionA]).sections).toHaveLength(1);
  });

  it("lays a section out as its own file, naming its property", () => {
    const sp = splitPall(rows);
    const g = parseGeneralLedgerMonthly(sectionAsFile(sp.preamble, sp.sections[1], "3610", "Building 1"));
    expect(g.propertyCode).toBe("3610");
    expect(g.monthly["0110-0000"][9]).toBe(600);
    expect(g.beginning["0110-0000"]).toBe(2500.5);
  });

  it("reads codes from its own charges and invoices, never from an account number", () => {
    const sp = splitPall(rows);
    expect(Object.fromEntries(activityCodes(sp.sections[0].rows))).toEqual({ "0800": 10 });
    expect(activityCodes(sp.sections[1].rows).get("3610")).toBe(4);
    expect(activityCodes([["Trans to 0110-0000"]]).size).toBe(0);
  });

  it("places by opening balances to the cent, which win over the charges", () => {
    const sp = splitPall(rows);
    const ev = sp.sections.map((s) => ({ index: s.index, opening: parseGeneralLedgerMonthly([...sp.preamble, ...s.rows]).beginning, activity: activityCodes(s.rows) }));
    // 9820's September balances are exactly section B's openings.
    const stored9820 = balancesThrough({ beginning: { "0110-0000": 2000.5, "4230-0000": 0 }, monthly: { "0110-0000": [500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], "4230-0000": [-9000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } }, 9);
    const p = placeSections(ev, [{ key: "9820", balances: stored9820 }, { key: "0800", balances: null }], resolve, "0800");
    expect(p[0]).toMatchObject({ key: "0800", how: "header" });
    expect(p[1]).toMatchObject({ key: "9820", how: "balances" });
  });

  it("will not let the charges place a section whose balances contradict them", () => {
    const sp = splitPall(rows);
    const ev = sp.sections.map((s) => ({ index: s.index, opening: parseGeneralLedgerMonthly([...sp.preamble, ...s.rows]).beginning, activity: activityCodes(s.rows) }));
    const p = placeSections(ev, [{ key: "3610", balances: { "0110-0000": 7, "4230-0000": -1 } }], resolve, null);
    expect(p[1].key).toBeNull();
    expect(p[1].note).toMatch(/balances do not match 3610/);
    // With no balances on file the charges place it.
    expect(placeSections(ev, [], resolve, null)[1]).toMatchObject({ key: "3610", how: "activity" });
  });

  it("never places two sections on one property, and says why a header goes unused", () => {
    const sp = splitPall(rows);
    const ev = [0, 1].map((i) => ({ index: i, opening: {}, activity: new Map([["3610", 9]]) }));
    expect(placeSections(ev, [], resolve, null).every((p) => p.key === null && /two sections/.test(p.note))).toBe(true);
    const lone = placeSections([{ index: 0, opening: {}, activity: new Map() }], [], resolve, "0300");
    expect(lone[0].note).toMatch(/0300, which has no operating statement/);
    expect(sp.sections).toHaveLength(2);
  });

  it("compares only accounts carrying a balance", () => {
    expect(balanceFingerprint({ a: 0, b: 5, c: 9 }, { a: 0.4, b: 5, c: 8 })).toEqual({ compared: 2, matched: 1 });
  });
});
