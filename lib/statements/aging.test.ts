import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseAgingReport, resolveAgingProperties } from "./parseAgingReport";
import { agingLookup, composeAging, statementFromAging, type AgingSnapshot } from "./aging";
import { accountOf } from "./receiptMatch";
import { creditNoticeParts, creditTotals, nextMonthLabel, renderCreditNotice } from "./creditNotice";

// The Crystal export's shape (11/10/2026 Credit Balance run): a header naming
// only the FIRST property, tenant rows, and each tenant's charges as
// multi-line cells — one cell of codes, one of descriptions, one of dates, and
// a cell per aging bucket whose amounts are TOP-ALIGNED with trailing blanks
// trimmed.
function workbook(): Buffer {
  const rows: (string | null)[][] = [];
  const row = (cells: Record<number, string>) => { const r: (string | null)[] = Array(35).fill(null); for (const [k, v] of Object.entries(cells)) r[Number(k)] = v; rows.push(r); };
  row({ 14: "Korman Commercial Properties, Inc" });
  row({ 1: "11/10/2026", 32: " 2:00:37PM" });
  row({ 14: "Aging Report\n(Detailed)" });
  row({ 1: "Property :\n  1100", 6: "Parkwood Professional Building\n", 17: "as of 11/10/2026" });
  row({ 24: "AGED\n1 - 30\nDAYS", 27: "AGED\n31 - 60\nDAYS", 31: "AGED\n61-90\nDAYS", 34: "AGED OVER\n90\nDAYS" });
  row({ 0: "Unit\nType", 5: "Unit Reference\nNumber", 10: "Occupant\nName", 19: "Deposits\nHeld", 22: "Balance \nDue" });
  // 1100-12330: a prepaid credit in 31–60 among charges in 1–30 / 31–60.
  row({ 0: "CURR ", 5: "12330", 9: "Ferry Good Treats", 19: "4,000.00", 22: "2,337.13", 24: "2,219.22", 27: "117.91" });
  row({ 4: " Contact    :", 11: " Jaclyn Ferry" });
  row({ 7: "CHARGE CODE", 12: "CHARGE \nDESCRIPTION", 22: "CHARGE DATE" });
  row({
    7: "AD \nAD \nPPD\nAD \nRNT\nUO ", 11: " gas - 7.15\n gas - 6.12\n PREPAIDS-OP CK#304\n gas - 8.14\n Monthly Rent\n U & O",
    22: "09/25/2026\n09/25/2026\n10/09/2026\n10/22/2026\n11/01/2026\n11/01/2026",
    24: "  \n  \n  \n 60.22\n 2,000.00\n 159.00", 27: " 55.91\n 62.20\n (0.20)\n\n", 31: "\n\n\n\n", 34: "\n\n\n\n",
  });
  row({ 1: "PROPERTY TOTALS", 22: "2,337.13" });
  row({ 7: "CHARGE CODE", 12: "CHARGE \nDESCRIPTION", 22: "CHARGE\nTOTAL" });
  row({ 7: "PPD\nRNT", 11: "PREPAIDS\nMonthly Rent", 22: "(0.20)\n2,000.00", 24: "\n2,000.00" });
  // The second property prints NO header — only its tenants.
  row({ 0: "CURR ", 5: "113", 9: "American Bread Company LLC", 19: "2,334.79", 22: "(1,580.47)", 34: "(1,580.47)" });
  row({ 4: " Contact    :", 11: " Matthew Kos" });
  row({ 4: " Phone      :", 11: "(215) 555-0100" });
  row({ 7: "CHARGE CODE", 12: "CHARGE \nDESCRIPTION", 22: "CHARGE DATE" });
  row({ 7: "YEC", 11: " 2025 Year End CAM Adjustment ", 22: "04/30/2026", 24: "  ", 27: "  ", 31: "  ", 34: " (1,580.47)" });
  row({ 0: "CURR ", 5: "301", 9: "Disaster Solutions, Inc.", 19: "5,318.50", 22: "0.00", 27: "321.01", 31: "311.99", 34: "(633.00)" });
  row({ 7: "CHARGE CODE", 12: "CHARGE \nDESCRIPTION", 22: "CHARGE DATE" });
  row({ 7: "YEC\nELC\nELX\nELC\nELX", 11: " 2025 Year End CAM Adjustment\n Elec 07/17 - 08/17\n Elec Service Fee\n Elec 08/17 - 09/17\n Elec Service Fee", 22: "04/30/2026\n08/31/2026\n08/31/2026\n09/30/2026\n09/30/2026", 24: "\n\n\n\n", 27: "\n\n\n 296.01\n 25.00", 31: "\n 286.99\n 25.00", 34: " (633.00)" });
  row({ 1: "PROPERTY TOTALS", 22: "(1,580.47)" });
  row({ 1: "GRAND TOTALS" });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("Skyline Aging Report (Credit Balance) import", () => {
  const parsed = parseAgingReport(workbook());

  it("reads the as-of, the run time and a block per property", () => {
    expect(parsed.asOfISO).toBe("2026-11-10");
    expect(parsed.runAt).toBe("2026-11-10T14:00:37-05:00"); // Eastern, as Skyline prints it
    expect(parsed.blocks.map((b) => b.headerCode)).toEqual(["1100", null]);
  });

  it("lines up each multi-line row with the bucket that carries its amount, and ties every tenant", () => {
    const ferry = parsed.blocks[0].tenants[0];
    expect(ferry).toMatchObject({ suite: "12330", tenantName: "Ferry Good Treats", depositsHeld: 4000, balanceDue: 2337.13, contact: "Jaclyn Ferry", tiesOut: true });
    expect(ferry.lines.map((l) => [l.code, l.amount, l.bucket])).toEqual([
      ["AD", 55.91, 1], ["AD", 62.2, 1], ["PPD", -0.2, 1], ["AD", 60.22, 0], ["RNT", 2000, 0], ["UO", 159, 0],
    ]);
    const bread = parsed.blocks[1].tenants[0];
    expect(bread.lines).toEqual([{ code: "YEC", description: "2025 Year End CAM Adjustment", dateISO: "2026-04-30", amount: -1580.47, bucket: 3, category: "cam" }]);
    expect(parsed.blocks[1].tenants.every((t) => t.tiesOut)).toBe(true);
  });

  it("places a headerless block by the suites and names the portal knows — never by position", () => {
    const { blocks, unresolved } = resolveAgingProperties(parseAgingReport(workbook()).blocks, [
      { unitRef: "4050-113", name: "American Bread Company, LLC" },
      { unitRef: "4060-113", name: "MVC MSO, LLC" },         // same suite, another building
      { unitRef: "4050-301", name: "Disaster Solutions Inc" },
    ]);
    expect(unresolved).toEqual([]);
    expect(blocks[0].tenants[0].unitRef).toBe("1100-12330");
    expect(blocks[1].tenants.map((t) => t.unitRef)).toEqual(["4050-113", "4050-301"]);
    const none = resolveAgingProperties(parseAgingReport(workbook()).blocks, []);
    expect(none.unresolved.map((t) => t.suite)).toEqual(["113", "301"]);
  });

  it("feeds Receipt Reconciliation the credits ITEMIZED, each with its date", () => {
    const { blocks } = resolveAgingProperties(parseAgingReport(workbook()).blocks, [{ unitRef: "4050-113", name: "American Bread Company LLC" }]);
    const snap: AgingSnapshot = { asOf: "2026-11-10", runAt: "2026-11-10T14:00:37", importedAt: "2026-11-10T19:00:00Z", importedBy: "Tami", sourceFile: "x.xls", propertyCodes: ["1100", "4050"], tenants: blocks.flatMap((b) => b.tenants) as AgingSnapshot["tenants"] };
    const cur = composeAging([snap]);
    const hit = agingLookup(cur, "4050-113");
    expect(hit.kind).toBe("found");
    if (hit.kind !== "found") return;
    const acct = accountOf(statementFromAging(hit.tenant));
    expect(acct.creditLines).toEqual([{ dateISO: "2026-04-30", description: "2025 Year End CAM Adjustment", amount: 1580.47 }]);
    expect(acct.net).toBe(-1580.47);
    // A newer report for one property replaces only that property.
    const later: AgingSnapshot = { ...snap, asOf: "2026-11-20", propertyCodes: ["1100"], tenants: snap.tenants.filter((t) => t.propertyCode === "1100") };
    expect(composeAging([snap, later]).coverage).toEqual({ "1100": "2026-11-20", "4050": "2026-11-10" });
    // …and a receipt sent on the 11/10 figures re-derives on them.
    expect(composeAging([snap, later], "2026-11-15").coverage).toEqual({ "1100": "2026-11-10", "4050": "2026-11-10" });
  });

  it("drafts the open-credit notice from the report, asking how to apply it", () => {
    const bread = parsed.blocks[1].tenants[0];
    const p = creditNoticeParts({ tenantName: "American Bread Company LLC", propertyName: "Building 5", suite: "113", lines: bread.lines, asOfISO: "2026-11-10", nextRentMonth: nextMonthLabel("2026-11-10"), signer: { name: "Tami Tomlinson", email: "t@x.com" } });
    expect(p.subject).toContain("$1,580.47");
    expect(p.opening).toContain("2025 Year End CAM Adjustment, dated April 30, 2026");
    expect(p.closing).toContain("December 2026 rent");
    const { html, text } = renderCreditNotice(bread.lines, "2026-11-10", p.opening, p.closing);
    expect(html).toContain("194 days");
    expect(text).toContain("Credit balance: ($1,580.47)");
    expect(creditTotals(parsed.blocks[1].tenants[1].lines)).toEqual({ credit: 633, charges: 633, net: 0 });
  });
});
