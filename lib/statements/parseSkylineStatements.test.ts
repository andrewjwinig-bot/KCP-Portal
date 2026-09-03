import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { classifyCharge, parseSkylineStatements, toISODate } from "./parseSkylineStatements";
import { agingOf, summarize } from "./summary";

// Build a workbook shaped like the Skyline "Statement" export: charges at
// A/G/S, the unit ref + bill-to block at W, the balance at Y.
type Row = { date?: string; desc: string; amount?: number; balance?: number };
function row(r: Row): unknown[] {
  const out: unknown[] = new Array(26).fill(null);
  if (r.date) out[0] = r.date;
  out[6] = r.desc;
  if (r.amount !== undefined) out[18] = r.amount;
  if (r.balance !== undefined) out[24] = r.balance;
  return out;
}
function header(unitRef: string, billTo: string): unknown[][] {
  const a: unknown[] = new Array(26).fill(null); a[22] = `${unitRef}\n`;
  const b: unknown[] = new Array(26).fill(null); b[22] = billTo;
  return [a, b, row({ date: "DATE", desc: "DESCRIPTION" })];
}
function build(rows: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
const CLOSE = (bal: number) => [
  row({ desc: "PREVIOUS MONTH ENDING BALANCE", balance: bal }),
  row({ desc: "CURRENT CHARGES" }),
  row({ desc: "TOTAL CURRENT", balance: 0 }),
];

describe("parseSkylineStatements", () => {
  it("parses one tenant's open charges, credits and balance", () => {
    const buf = build([
      ...header("1100-34-CU", "Shear Sensation\n12340 Academy Road\nPhiladelphia, PA 19154"),
      row({ date: "04/22/2026", desc: "2025 Year End CAM Adjustment", amount: 9829.02 }),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 1732.55 }),
      row({ date: "09/01/2026", desc: "U & O", amount: 251 }),
      row({ desc: "Open Credits", amount: -586.78 }),
      ...CLOSE(11225.79),
    ]);
    const { statements, period, mismatched } = parseSkylineStatements(buf);
    expect(mismatched).toEqual([]);
    expect(period).toBe("2026-09");
    expect(statements).toHaveLength(1);
    const s = statements[0];
    expect(s).toMatchObject({
      unitRef: "1100-34", skylineUnitRef: "1100-34-CU", propertyCode: "1100", suite: "34",
      tenantName: "Shear Sensation", reportedBalance: 11225.79, chargeTotal: 11225.79, tiesOut: true,
    });
    expect(s.address).toEqual(["12340 Academy Road", "Philadelphia, PA 19154"]);
    expect(s.charges.map((c) => c.category)).toEqual(["cam", "rent", "uando", "credit"]);
    expect(s.charges[0]).toMatchObject({ dateISO: "2026-04-22", reconYear: 2025 });
    expect(s.charges[3].dateISO).toBeNull();
  });

  it("continues a tenant across a page break", () => {
    const buf = build([
      ...header("7010-201-CU", "Einstein Podiatry\n12401 Academy Road"),
      row({ date: "08/01/2026", desc: "Monthly Rent", amount: 4500 }),
      ...header("7010-201-CU", "Einstein Podiatry\n12401 Academy Road"),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 4500 }),
      ...CLOSE(9000),
    ]);
    const { statements, mismatched } = parseSkylineStatements(buf);
    expect(mismatched).toEqual([]);
    expect(statements).toHaveLength(1);
    expect(statements[0].charges).toHaveLength(2);
    expect(statements[0].chargeTotal).toBe(9000);
  });

  it("drops Crystal's repeated detail group, keeping the tie-out", () => {
    const detail = [
      row({ date: "08/01/2026", desc: "Monthly Rent", amount: 4500 }),
      row({ date: "08/01/2026", desc: "U & O", amount: 373 }),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 4500 }),
      row({ date: "09/01/2026", desc: "U & O", amount: 373 }),
    ];
    const buf = build([
      ...header("7010-201-CU", "Einstein Podiatry\n12401 Academy Road"),
      ...detail, ...detail,   // rendered twice before the balance
      ...CLOSE(9746),
      ...detail, ...detail,   // and again after it
      ...CLOSE(9746),
    ]);
    const { statements, mismatched } = parseSkylineStatements(buf);
    expect(mismatched).toEqual([]);
    expect(statements).toHaveLength(1);
    expect(statements[0].charges).toHaveLength(4);
    expect(statements[0].chargeTotal).toBe(9746);
  });

  it("keeps genuinely duplicated charges that already tie out", () => {
    const buf = build([
      ...header("9510-414-CU", "Hair Concepts\n600 Germantown Pike"),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 1000 }),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 1000 }),
      ...CLOSE(2000),
    ]);
    const { statements } = parseSkylineStatements(buf);
    expect(statements[0].charges).toHaveLength(2);
    expect(statements[0].chargeTotal).toBe(2000);
  });

  it("treats a tenant with no balance row as a zero account", () => {
    const buf = build([...header("2300-1869-CU", "China Sun\n1869 Street Road")]);
    const { statements, mismatched } = parseSkylineStatements(buf);
    expect(mismatched).toEqual([]);
    expect(statements[0]).toMatchObject({ charges: [], chargeTotal: 0, reportedBalance: 0, tiesOut: true });
  });

  it("flags a tenant whose charges don't reconcile to Skyline's balance", () => {
    const buf = build([
      ...header("4500-2851-CU", "Tenant\n1 Main St"),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 1000 }),
      ...CLOSE(1500),
    ]);
    const { statements, mismatched } = parseSkylineStatements(buf);
    expect(mismatched).toEqual(["4500-2851"]);
    expect(statements[0].tiesOut).toBe(false);
  });

  it("strips Skyline's charge-type suffix so refs match the rent roll", () => {
    const buf = build([
      ...header("7010-12311-CU", "Tenant\n1 Main St"),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 100 }),
      ...CLOSE(100),
    ]);
    const { statements } = parseSkylineStatements(buf);
    expect(statements[0]).toMatchObject({
      unitRef: "7010-12311", skylineUnitRef: "7010-12311-CU", propertyCode: "7010", suite: "12311",
    });
  });

  it("rounds Skyline's float noise to cents", () => {
    const buf = build([
      ...header("7010-203-CU", "Tenant\n1 Main St"),
      row({ date: "07/31/2026", desc: "Elec   06/11/2026 - 07/14/2026", amount: 312.90000000000003 }),
      ...CLOSE(312.9),
    ]);
    const { statements } = parseSkylineStatements(buf);
    expect(statements[0].charges[0].amount).toBe(312.9);
  });
});

describe("classifyCharge", () => {
  const cases: [string, string][] = [
    ["Monthly Rent", "rent"],
    ["RENTAL : FURNITURE", "rent"],
    ["2026 CAM Estimate", "cam"],
    ["Common Area Maint Estimate", "cam"],
    ["2025 Year End CAM Adjustment", "cam"],
    ["2026 INS Estimate", "insurance"],
    ["INSURANCE EST", "insurance"],
    ["2026 RET Estimate", "ret"],
    ["Real Estate Tax", "ret"],
    ["2024 RET Reconciliation", "ret"],
    ["U & O", "uando"],
    ["WATER & SEWER", "utilities"],
    ["Water Alocation 1.1.26-6.30.26", "utilities"],
    ["Elec  05/12/2026 - 06/11/2026", "utilities"],
    ["Elec Service Fee", "utilities"],
    ["gas - 11.4.2025 - 12.4.2025", "utilities"],
    ["PGW - 6.12.2026 - 7.15.2026", "utilities"],
    ["Open Credits", "credit"],
    ["Clear Channel-Merger consent", "other"],
  ];
  it.each(cases)("%s → %s", (desc, expected) => {
    expect(classifyCharge(desc, 100)).toBe(expected);
  });

  it("does not read 'current' as rent", () => {
    expect(classifyCharge("Current year true-up", 100)).toBe("other");
  });
});

describe("toISODate", () => {
  it("converts Skyline dates", () => {
    expect(toISODate("04/22/2026")).toBe("2026-04-22");
    expect(toISODate("9/1/26")).toBe("2026-09-01");
    expect(toISODate("")).toBeNull();
    expect(toISODate("13/40/2026")).toBeNull();
  });
});

describe("aging", () => {
  const at = (dateISO: string | null) => ({ dateISO, description: "x", amount: 1, category: "other" as const });
  it("ages by calendar month against the statement period", () => {
    expect(agingOf(at("2026-09-01"), "2026-09")).toBe("current");
    expect(agingOf(at("2026-10-01"), "2026-09")).toBe("current"); // future-dated
    expect(agingOf(at("2026-08-31"), "2026-09")).toBe("d30");
    expect(agingOf(at("2026-07-01"), "2026-09")).toBe("d60");
    expect(agingOf(at("2026-06-30"), "2026-09")).toBe("d90");
    expect(agingOf(at("2026-04-22"), "2026-09")).toBe("d90plus");
    expect(agingOf(at(null), "2026-09")).toBe("current");
  });

  it("splits current from prior balance and nets credits", () => {
    const st = {
      unitRef: "1100-34", skylineUnitRef: "1100-34-CU", propertyCode: "1100", suite: "34", tenantName: "T", address: [],
      reportedBalance: 11225.79, chargeTotal: 11225.79, tiesOut: true,
      charges: [
        { dateISO: "2026-04-22", description: "2025 Year End CAM Adjustment", amount: 9829.02, category: "cam" as const },
        { dateISO: "2026-09-01", description: "Monthly Rent", amount: 1732.55, category: "rent" as const },
        { dateISO: "2026-09-01", description: "U & O", amount: 251, category: "uando" as const },
        { dateISO: null, description: "Open Credits", amount: -586.78, category: "credit" as const },
      ],
    };
    const s = summarize(st, "2026-09");
    expect(s.totalDue).toBe(11225.79);
    expect(s.currentCharges).toBe(1396.77); // 1732.55 + 251 − 586.78
    expect(s.priorBalance).toBe(9829.02);
    expect(s.credits).toBe(586.78);
    expect(s.pastDue).toBe(true);
    expect(s.pastDueAmount).toBe(9829.02);
    expect(s.oldestISO).toBe("2026-04-22");
    expect(s.byCategory.map((c) => c.category)).toEqual(["rent", "cam", "uando", "credit"]);
    expect(s.byAging).toEqual([{ bucket: "current", amount: 1396.77 }, { bucket: "d90plus", amount: 9829.02 }]);
  });
});
