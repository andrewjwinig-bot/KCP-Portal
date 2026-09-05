import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { classifyCharge, parseSkylineStatements, toISODate } from "./parseSkylineStatements";
import { agingOf, statementCharges, summarize } from "./summary";
import { mergeStatements, shouldAutoPublish } from "./store";
import type { TenantStatement } from "./types";

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
/** Close a tenant: prior subtotal, then the current section and its total. */
const CLOSE = (bal: number, current: unknown[][] = [], currentTotal = 0) => [
  row({ desc: "PREVIOUS MONTH ENDING BALANCE", balance: bal }),
  row({ desc: "CURRENT CHARGES" }),
  ...current,
  row({ desc: "TOTAL CURRENT", balance: currentTotal }),
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

describe("report order", () => {
  it("keeps tenants in the sequence Skyline printed, not alphabetical", () => {
    // Skyline's real order: 1100-34 precedes 1100-12330. Sorting would invert it.
    const buf = build([
      ...header("1100-34-CU", "Shear Sensation\n1 Main St"),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 100 }), ...CLOSE(100),
      ...header("1100-36-CU", "Honest Real Estate\n2 Main St"),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 100 }), ...CLOSE(100),
      ...header("1100-12330-CU", "Ferry Good Treats\n3 Main St"),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 100 }), ...CLOSE(100),
    ]);
    const { statements } = parseSkylineStatements(buf);
    expect(statements.map((s) => s.unitRef)).toEqual(["1100-34", "1100-36", "1100-12330"]);
  });

  it("keeps charges in the printed order — oldest first, credits last", () => {
    const buf = build([
      ...header("1100-34-CU", "Shear Sensation\n1 Main St"),
      row({ date: "04/25/2025", desc: "2024 CAM Reconciliation", amount: 1130 }),
      row({ date: "04/22/2026", desc: "2025 Year End CAM Adjustment", amount: 9829.02 }),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 1732.55 }),
      row({ desc: "Open Credits", amount: -586.78 }),
      ...CLOSE(12104.79),
    ]);
    const [st] = parseSkylineStatements(buf).statements;
    expect(statementCharges(st).map((c) => c.description)).toEqual([
      "2024 CAM Reconciliation", "2025 Year End CAM Adjustment", "Monthly Rent", "Open Credits",
    ]);
  });

  it("pins an out-of-place undated row to the end", () => {
    const buf = build([
      ...header("1100-34-CU", "Shear Sensation\n1 Main St"),
      row({ desc: "Open Credits", amount: -100 }),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 500 }),
      ...CLOSE(400),
    ]);
    const [st] = parseSkylineStatements(buf).statements;
    expect(statementCharges(st).map((c) => c.description)).toEqual(["Monthly Rent", "Open Credits"]);
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

describe("shouldAutoPublish", () => {
  const gate = (o: Partial<Parameters<typeof shouldAutoPublish>[0]>) =>
    shouldAutoPublish({ wants: true, untied: 0, alreadyPublished: false, ...o });

  it("publishes a clean month on import", () => {
    expect(gate({})).toBe(true);
  });

  it("holds the whole month back when even one tenant doesn't tie out", () => {
    expect(gate({ untied: 1 })).toBe(false);
    expect(gate({ untied: 12 })).toBe(false);
  });

  it("respects staff switching auto-publish off", () => {
    expect(gate({ wants: false })).toBe(false);
  });

  it("is a no-op on a month that's already live", () => {
    expect(gate({ alreadyPublished: true })).toBe(false);
    // …including one that's live with a tenant under review: it never retracts.
    expect(gate({ alreadyPublished: true, untied: 3 })).toBe(false);
  });
});

describe("mergeStatements", () => {
  const st = (unitRef: string, chargeTotal: number, importedAt = "2026-09-01T00:00:00Z"): TenantStatement => ({
    unitRef, skylineUnitRef: `${unitRef}-CU`, propertyCode: unitRef.split("-")[0], suite: unitRef.split("-")[1],
    tenantName: unitRef, address: [], charges: [], reportedBalance: chargeTotal, chargeTotal, tiesOut: true, importedAt,
  });

  it("replaces an uploaded tenant and keeps one the upload didn't mention", () => {
    const { statements, stats } = mergeStatements(
      [st("1100-34", 100), st("1100-36", 200), st("2300-1817", 300)],
      [st("1100-34", 150, "later")],
    );
    expect(statements.map((s) => [s.unitRef, s.chargeTotal])).toEqual([
      ["1100-34", 150], ["1100-36", 200], ["2300-1817", 300],
    ]);
    expect(stats).toMatchObject({ replaced: 1, added: 0, carriedOver: 2, changed: 1, netChange: 50 });
  });

  it("never drops a building the corrected export didn't cover", () => {
    // A one-building re-import must not look like a mass move-out.
    const existing = [st("1100-34", 100), st("2300-1817", 300), st("2300-1847", 400)];
    const { statements, stats } = mergeStatements(existing, [st("1100-34", 100, "later")]);
    expect(statements).toHaveLength(3);
    expect(stats.carriedOver).toBe(2);
  });

  it("keeps a replaced tenant in their slot rather than moving them to the end", () => {
    const { statements } = mergeStatements(
      [st("1100-34", 1), st("1100-36", 2), st("1100-12330", 3)],
      [st("1100-36", 99, "later")],
    );
    expect(statements.map((s) => s.unitRef)).toEqual(["1100-34", "1100-36", "1100-12330"]);
  });

  it("appends genuinely-new tenants in the order the upload printed them", () => {
    const { statements, stats } = mergeStatements(
      [st("1100-34", 1)],
      [st("9510-414", 2), st("9510-420", 3)],
    );
    expect(statements.map((s) => s.unitRef)).toEqual(["1100-34", "9510-414", "9510-420"]);
    expect(stats).toMatchObject({ replaced: 0, added: 2, carriedOver: 1, changed: 0 });
  });

  it("reports no change when a re-import carries identical balances", () => {
    const { stats } = mergeStatements([st("1100-34", 100)], [st("1100-34", 100, "later")]);
    expect(stats).toMatchObject({ replaced: 1, changed: 0, netChange: 0, carriedOver: 0 });
  });

  it("nets the movement across a mid-month correction", () => {
    const { stats } = mergeStatements(
      [st("1100-34", 100), st("1100-36", 500)],
      [st("1100-34", 250, "later"), st("1100-36", 400, "later")],
    );
    expect(stats).toMatchObject({ replaced: 2, changed: 2, netChange: 50 });
  });

  it("merges into an empty month as a plain add", () => {
    const { statements, stats } = mergeStatements([], [st("1100-34", 100)]);
    expect(statements).toHaveLength(1);
    expect(stats).toMatchObject({ replaced: 0, added: 1, carriedOver: 0 });
  });
});

describe("current charges section", () => {
  // The real M&T Bank statement: $1,164.90 already outstanding, $13,346.08
  // newly billed, $14,510.98 due. Reading the first subtotal alone understates
  // the tenant by the entire current-charges section.
  const mAndT = () => build([
    ...header("2300-1817-CU", "M & T Bank\n1817 Street Road\nBensalem PA  19020"),
    row({ date: "04/22/2026", desc: "2025 Year End CAM Adjustment", amount: 300.86 }),
    row({ date: "04/22/2026", desc: "2025 Year End RET Adjustment", amount: 864.04 }),
    ...CLOSE(1164.90, [
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 11458.08 }),
      row({ date: "09/01/2026", desc: "2026 CAM Estimate", amount: 1142 }),
      row({ date: "09/01/2026", desc: "2026 RET Estimate", amount: 746 }),
    ], 13346.08),
  ]);

  it("bills the prior balance PLUS the current charges", () => {
    const { statements, mismatched } = parseSkylineStatements(mAndT());
    expect(mismatched).toEqual([]);
    expect(statements[0]).toMatchObject({
      priorBalance: 1164.90,
      currentTotal: 13346.08,
      reportedBalance: 14510.98,   // Total Amount Due on the laser statement
      chargeTotal: 14510.98,
      tiesOut: true,
    });
    expect(statements[0].charges).toHaveLength(5);
  });

  it("tags each charge with the section it printed under", () => {
    const [st] = parseSkylineStatements(mAndT()).statements;
    expect(st.charges.map((c) => c.section)).toEqual(["prior", "prior", "current", "current", "current"]);
  });

  it("flags a current section that doesn't sum to TOTAL CURRENT", () => {
    const buf = build([
      ...header("2300-1817-CU", "M & T Bank\n1817 Street Road"),
      row({ date: "04/22/2026", desc: "2025 Year End CAM Adjustment", amount: 300.86 }),
      ...CLOSE(300.86, [row({ date: "09/01/2026", desc: "Monthly Rent", amount: 1000 })], 9999),
    ]);
    const { statements, mismatched } = parseSkylineStatements(buf);
    expect(mismatched).toEqual(["2300-1817"]);
    expect(statements[0].tiesOut).toBe(false);
  });

  it("accepts a month whose charges are all already outstanding", () => {
    // Which section a charge lands in depends on WHEN the report was run: run
    // after the 1st and that month's charges are already outstanding, so they
    // print above the balance and TOTAL CURRENT is zero for every tenant. That
    // is the normal shape of an open-items export, not a broken one.
    const buf = build([
      ...header("2300-1817-CU", "M & T Bank\n1817 Street Road"),
      row({ date: "04/22/2026", desc: "2025 Year End CAM Adjustment", amount: 300.86 }),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 11458.08 }),
      ...CLOSE(11758.94),
      ...header("1100-34-CU", "Shear Sensation\n1 Main St"),
      row({ date: "09/01/2026", desc: "Monthly Rent", amount: 1130 }),
      ...CLOSE(1130),
    ]);
    const out = parseSkylineStatements(buf);
    expect(out.mismatched).toEqual([]);
    expect(out.statements[0].reportedBalance).toBe(11758.94);
    expect(out.statements[0].currentTotal).toBe(0);
  });

  it("bills a paid-off tenant only what is still open", () => {
    // A tenant who paid this month's charges before the export simply has
    // fewer open lines — the smaller balance is correct, not a parse failure.
    const buf = build([
      ...header("2300-1817-CU", "M & T Bank\n1817 Street Road"),
      row({ date: "04/22/2026", desc: "2025 Year End CAM Adjustment", amount: 300.86 }),
      row({ date: "04/22/2026", desc: "2025 Year End RET Adjustment", amount: 864.04 }),
      ...CLOSE(1164.90),
    ]);
    const [st] = parseSkylineStatements(buf).statements;
    expect(st).toMatchObject({ reportedBalance: 1164.90, chargeTotal: 1164.90, tiesOut: true });
  });

});


