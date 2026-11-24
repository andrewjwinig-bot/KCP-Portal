import { describe, expect, it } from "vitest";
import { statementsFromLaserPages } from "./parseLaserPdf";
import { wholeExportProperties } from "./store";
import type { PdfItem } from "../pdf/pdfText";

// A synthetic page laid out as Crystal prints the Laser Statement (the real
// PDFs carry tenant contacts and stay out of the repo).
type Line = [date: string | null, desc: string, amount?: string, balance?: string];
function page(unit: string, name: string, lines: Line[], total: string, continued = false): PdfItem[] {
  const it = (x: number, y: number, s: string): PdfItem => ({ x, y, s });
  const out: PdfItem[] = [
    it(378, 766, unit), it(25, 754, "Property Address"), it(378, 754, name), it(378, 743, "One Neshaminy Interplex"),
    it(265, 737, "Statement"), it(378, 733, "Suite 101"), it(378, 722, "Trevose PA 19053"),
    it(30, 706, "DATE"), it(166, 706, "DESCRIPTION"), it(336, 706, "AMOUNT DUE"), it(487, 706, "BALANCE"),
  ];
  let y = 683;
  for (const [d, desc, amt, bal] of lines) {
    if (d) out.push(it(23, y, d));
    out.push(it(102, y, desc));
    if (amt) out.push(it(390, y, amt));
    if (bal) out.push(it(530, y + 2, bal));   // the balance prints a point or two above its label
    y -= 11;
  }
  if (continued) out.push(it(18, 472, "CONTINUED ON THE NEXT PAGE"));
  out.push(it(18, 448, "Total Amount Due:"), it(continued ? 502 : 529, 449, total));
  // The remittance coupon repeats the figures — never read as charges.
  out.push(it(378, 358, "Statement Date: 11/01/2026"), it(414, 196, `Unit : ${unit}`), it(470, 172, `: ${total}`));
  return out;
}

describe("Laser Statement PDF", () => {
  const a = page("3610-101-CU", "Altruistic Home Care Agency", [
    ["09/01/2026", "Monthly Rent", "1,795.50"],
    ["09/30/2026", "Elec Service Fee", "25.00"],
    [null, "PREVIOUS MONTH ENDING BALANCE", undefined, "1,820.50"],
    [null, "CURRENT CHARGES"],
    ["11/01/2026", "Monthly Rent", "1,795.50"],
    ["11/01/2026", "2026 CAM Estimate", "110.00"],
    [null, "TOTAL CURRENT", undefined, "1,905.50"],
  ], "$ 3,726.00");
  // A tenant that runs onto a second page, with an open credit.
  const b1 = page("3620-108-CU", "James D. Morrissey, Inc.", [
    ["06/01/2026", "2026 CAM Estimate", "60.00"],
    ["06/23/2026", "fire inspection", "75.00"],
    [null, "Open Credits", "(1,243.12)"],
  ], "$ See the next page", true);
  const b2 = page("3620-108-CU", "James D. Morrissey, Inc.", [
    [null, "PREVIOUS MONTH ENDING BALANCE", undefined, "(1,108.12)"],
    [null, "CURRENT CHARGES"],
    ["11/01/2026", "Monthly Rent", "1,489.17"],
    [null, "TOTAL CURRENT", undefined, "1,489.17"],
  ], "$ 381.05");

  it("reads each tenant, both halves, across a continued page, and ties to the printed total", () => {
    const r = statementsFromLaserPages([a, b1, b2]);
    expect(r.period).toBe("2026-11");
    expect(r.mismatched).toEqual([]);
    expect(r.statements.map((s) => s.unitRef)).toEqual(["3610-101", "3620-108"]);
    const [x, y] = r.statements;
    expect(x).toMatchObject({ tenantName: "Altruistic Home Care Agency", propertyCode: "3610", suite: "101", priorBalance: 1820.5, currentTotal: 1905.5, reportedBalance: 3726, tiesOut: true });
    expect(x.address).toEqual(["One Neshaminy Interplex", "Suite 101", "Trevose PA 19053"]);
    expect(x.charges.map((c) => [c.dateISO, c.amount, c.section])).toEqual([
      ["2026-09-01", 1795.5, "prior"], ["2026-09-30", 25, "prior"],
      ["2026-11-01", 1795.5, "current"], ["2026-11-01", 110, "current"],
    ]);
    expect(y).toMatchObject({ priorBalance: -1108.12, currentTotal: 1489.17, reportedBalance: 381.05, tiesOut: true });
    expect(y.charges.find((c) => c.description === "Open Credits")?.amount).toBe(-1243.12);
  });

  it("holds back a tenant whose lines do not add up to the Total Amount Due printed", () => {
    const bad = page("3610-102-CU", "AREF Holdings Limited", [
      ["09/30/2026", "Elec Service Fee", "25.00"],
      [null, "PREVIOUS MONTH ENDING BALANCE", undefined, "25.00"],
      [null, "TOTAL CURRENT", undefined, "0.00"],
    ], "$ 125.00");
    const r = statementsFromLaserPages([bad]);
    expect(r.mismatched).toEqual(["3610-102"]);
    expect(r.statements[0].tiesOut).toBe(false);
  });

  it("skips a page that is not a statement", () => {
    expect(statementsFromLaserPages([[{ x: 20, y: 700, s: "Cover sheet" }]]).statements).toEqual([]);
  });
});

describe("which properties an upload covers whole", () => {
  it("a single tenant's re-run clears no one; a building's export covers its property", () => {
    const st = (unitRef: string) => ({ unitRef, propertyCode: unitRef.split("-")[0] }) as never;
    expect(wholeExportProperties([st("3620-104")])).toEqual([]);
    expect(wholeExportProperties([st("3610-101"), st("3610-102"), st("3620-104")])).toEqual(["3610"]);
  });
});
