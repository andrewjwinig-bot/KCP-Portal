// The printed Delinquency / Aging Report (Detailed), laid out by position as
// pdfjs returns it. Synthetic tenants — the real report carries tenant contacts.
import { describe, expect, it } from "vitest";
import { agingFromPdfPages, bucketOf, looksLikeTenantAging, withoutRepeats, type PdfItem } from "./parseAgingPdf";

const it_ = (x: number, y: number, s: string): PdfItem => ({ x, y, s });
const header = (code: string, name: string, page: number): PdfItem[] => [
  it_(225, 759, "Korman Commercial Properties, Inc"), it_(22, 758, "11/19/2026"), it_(547, 758, "3:07:54PM"),
  it_(18, 747, "User:"), it_(539, 747, `Page ${page} of 2`), it_(231, 736, "Delinquency / Aging Report"), it_(278, 719, "(Detailed)"),
  it_(21, 697, "Property :"), it_(76, 697, name), it_(281, 696, "as of 11/19/2026"), it_(26, 685, code),
  it_(389, 670, "AGED"), it_(29, 660, "Unit"), it_(174, 660, "Occupant"), it_(269, 660, "Deposits"), it_(330, 660, "Balance"),
  it_(29, 650, "Type"), it_(77, 650, "Number"), it_(180, 650, "Name"), it_(275, 650, "Held"), it_(336, 650, "Due"),
];
const charge = (y: number, code: string, desc: string, date: string, x: number, amt: string): PdfItem[] =>
  [it_(102, y, code), it_(132, y, desc), it_(333, y, date), it_(x, y, amt)];

describe("agingFromPdfPages", () => {
  const page1: PdfItem[] = [
    ...header("1100", "Sample Plaza", 1),
    // Tenant A: figures set a point below the name (as Crystal prints some rows).
    it_(18, 633, "CURR"), it_(59, 633, "34"), it_(108, 633, "Alpha Salon"), it_(283, 633, "500.00"), it_(339, 633, "1,142.00"),
    it_(398, 632, "142.00"), it_(566, 632, "1,000.00"),
    it_(54, 619, "Contact"), it_(83, 619, ":"), it_(128, 619, "Pat Doe"),
    it_(54, 607, "Phone"), it_(83, 607, ":"), it_(126, 607, "(215) 555-0100"),
    it_(95, 561, "CHARGE"), it_(101, 551, "CODE"),
    ...charge(533, "YEC", "2025 Year End CAM Adjustment", "04/22/2026", 566, "1,000.00"),
    ...charge(522, "UO", "U & O", "11/01/2026", 403, "142.00"),
    // Tenant B starts at the foot of the page; its charges run onto page 2.
    it_(18, 300, "CURR"), it_(59, 300, "36"), it_(108, 300, "Beta Realty, LLC"), it_(283, 300, "0.00"), it_(339, 300, "90.00"),
    it_(458, 300, "100.00"), it_(512, 300, "(10.00)"),
  ];
  const page2: PdfItem[] = [
    ...header("1100", "Sample Plaza", 2),
    ...charge(600, "RNT", "Monthly Rent", "10/01/2026", 458, "100.00"),
    // a line whose amount sits a point lower than its words
    it_(102, 590, "PPD"), it_(132, 590, "PREPAIDS"), it_(333, 590, "09/01/2026"), it_(516, 589, "(10.00)"),
    it_(24, 500, "PROPERTY TOTALS"), it_(283, 504, "500.00"), it_(339, 504, "1,232.00"),
    it_(101, 470, "UO"), it_(132, 470, "U & O"), it_(346, 470, "142.00"), it_(407, 470, "142.00"),
  ];

  const parsed = agingFromPdfPages([page1, page2]);

  it("reads the as-of date and the run time (Eastern)", () => {
    expect(parsed.asOfISO).toBe("2026-11-19");
    expect(parsed.runAt).toBe("2026-11-19T15:07:54-05:00");
  });

  it("takes the property from every page and carries a tenant across the break", () => {
    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks[0].headerCode).toBe("1100");
    const [a, b] = parsed.blocks[0].tenants;
    expect(a).toMatchObject({ suite: "34", tenantName: "Alpha Salon", unitType: "CURR", depositsHeld: 500, balanceDue: 1142, contact: "Pat Doe", phone: "(215) 555-0100", tiesOut: true });
    expect(a.lines.map((l) => [l.code, l.dateISO, l.amount, l.bucket])).toEqual([
      ["YEC", "2026-04-22", 1000, 3],
      ["UO", "2026-11-01", 142, 0],
    ]);
    expect(a.lines[1].category).toBe("uando");
    expect(b.tenantName).toBe("Beta Realty, LLC");
    expect(b.lines.map((l) => [l.code, l.amount, l.bucket])).toEqual([["RNT", 100, 1], ["PPD", -10, 2]]);
    expect(b.tiesOut).toBe(true);
  });

  it("ignores the property-totals summary", () => {
    expect(parsed.blocks[0].tenants.flatMap((t) => t.lines).filter((l) => l.code === "UO")).toHaveLength(1);
  });

  it("refuses a PDF that isn't the tenant aging", () => {
    expect(looksLikeTenantAging([[it_(200, 700, "Aged Trial Balance"), it_(20, 650, "Vendor")]])).toBe(false);
    expect(() => agingFromPdfPages([[it_(200, 700, "Something else")]])).toThrow();
  });
});

describe("buckets and repeats", () => {
  it("places an amount by where its column starts", () => {
    expect([398, 458, 512, 566, 558].map(bucketOf)).toEqual([0, 1, 2, 3, 3]);
  });

  it("collapses a detail group Crystal printed twice, only when one copy ties", () => {
    const l = (code: string, amount: number) => ({ code, dateISO: "2026-11-01", amount, description: code });
    const once = [l("RNT", 4500), l("UO", 373)];
    expect(withoutRepeats([...once, ...once], 4873)).toEqual(once);
    // Twice is the real balance: keep both.
    expect(withoutRepeats([...once, ...once], 9746)).toHaveLength(4);
    // Not an exact repeat: left as read.
    expect(withoutRepeats([l("RNT", 4500), l("RNT", 4500), l("UO", 1)], 4501)).toHaveLength(3);
  });
});
