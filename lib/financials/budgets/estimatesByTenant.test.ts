import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { estimateRows, estimateTotals, skylineEstimateRows, currentBilling, round5 } from "./estimatesByTenant";
import { buildEstimatesXlsx } from "./estimatesExport";
import { applyEstimateOverrides, seededEstimateOverrides } from "./estimateOverrides";
import { chargeRowsToCSV } from "@/lib/cam/office/exports";
import { statementMonthlyBilling } from "./statementBillingMath";
import { checkBasisForLine } from "@/lib/financials/operating-statements/rentCheck";

const m = (v: number) => new Array(12).fill(v);
const retail = (recon: { cam: number; ins: number; ret: number }, extra: any = {}) =>
  ({ kind: "retail", camPrs: 5, insPrs: 5, retPrs: 5, adminFeePct: 10, grossLease: false, capPct: null, excludedLines: 0, reconOcc: null, recon, ...extra });
const row = (o: any) => ({ unitRef: "7010-1", tenant: "Acme", sqft: 1200, status: "contracted", rent: m(2000), cam: m(0), ins: m(0), ret: m(0), assumed: m(0).map(() => false), ...o });
const est: any = { reconYear: 2025, budgetYear: 2027, ratios: { cam: 1.06, ins: 1.1, ret: 1.02 } };

describe("CAM estimates by tenant", () => {
  const rows = estimateRows([
    // Billed $400 CAM today; the 2025 recon says $540 a month was owed; the 2027 budget sets $580.
    row({ unitRef: "7010-1", cam: m(580), ins: m(100), ret: m(400), billing: { cam: 400, ins: 100, ret: 400 },
      method: retail({ cam: 540 * 12, ins: 100 * 12, ret: 400 * 12 }) }),
    // A lease ending in June: its estimate is averaged over the months billed, not twelve.
    row({ unitRef: "7010-2", tenant: "Shortco", cam: [...m(300).slice(0, 6), ...m(0).slice(0, 6)], billing: { cam: 300, ins: 0, ret: 0 } }),
    // A newer lease on no recon: nothing billed today.
    row({ unitRef: "7010-3", tenant: "Newco", cam: m(250), method: { kind: "new", sqft: 1000, assumption: "nnn" } }),
    // Gross lease, nothing either side: left out.
    row({ unitRef: "7010-4", tenant: "Gross", billing: { cam: 0, ins: 0, ret: 0 } }),
    // Vacant: left out.
    row({ unitRef: "7010-5", tenant: "", rent: m(0) }),
  ] as any, est);

  it("no base rent — just the estimates: today, the recon actual, the budget", () => {
    const a = rows.find((r) => r.unitRef === "7010-1")!;
    expect(a.now).toEqual({ cam: 400, ins: 100, ret: 400, total: 900 });
    expect(a.recon).toEqual({ cam: 540, ins: 100, ret: 400, total: 1040 });
    expect(a.next).toEqual({ cam: 580, ins: 100, ret: 400, total: 1080 });
    expect(a.change).toBe(180);
    expect(a.changePct).toBeCloseTo(20, 6);
    expect(a.jump).not.toBeNull();
  });
  it("explains the change in dollars: the catch-up to the recon actual, then the budget's pool change", () => {
    const a = rows.find((r) => r.unitRef === "7010-1")!;
    const cam = a.why.find((w) => w.part === "cam")!;
    expect(cam.catchUp).toBe(140);
    expect(cam.budgetChange).toBe(40);
    expect(cam.poolPct).toBeCloseTo(6, 6);
    expect(a.reason).toBe("+$140 to the 2025 actual · +$40 budget (CAM pool +6.0%)");
  });
  it("averages over the months billed", () => {
    expect(rows.find((r) => r.unitRef === "7010-2")!.next.cam).toBe(300);
  });
  it("a newer lease has no today, no % and says why", () => {
    const n = rows.find((r) => r.unitRef === "7010-3")!;
    expect(n.now).toBeNull();
    expect(n.changePct).toBeNull();
    expect(n.reason).toMatch(/Newer lease/);
  });
  it("leaves out gross leases and vacancies", () => {
    expect(rows.map((r) => r.unitRef)).toEqual(["7010-1", "7010-2", "7010-3"]);
  });
  it("totals", () => {
    const t = estimateTotals(rows);
    expect(t.now.total).toBe(1200);
    expect(t.next.total).toBe(1080 + 300 + 250);
    expect(t.flagged).toBe(1);
  });
  it("Skyline: the CAM recon's recurring-charge format, computed estimates to the nearest $5", () => {
    const sky = skylineEstimateRows(rows, 2027);
    expect(sky[0]).toEqual({ unit: "7010-1-CU", seq: 2, chargeCode: "CAM", chargeDescription: "2027 CAM Estimate", freq: "M", effectiveDate: "2027-01-01", endDate: "", amount: 580 });
    const csv = chargeRowsToCSV(sky).split("\n");
    expect(csv).toContain("7010-1-CU,4,RET,2027 RET Estimate,M,2027-01-01,,400");
  });
  it("the review workbook ties: live formulas for every derived figure, and the why", async () => {
    const buf = await buildEstimatesXlsx({ propertyName: "Parkwood", propertyCode: "7010", year: 2027, reconYear: 2025, rows });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    const ws = wb.worksheets[0];
    let head = 0;
    ws.eachRow((r, i) => { if (!head && r.getCell(1).value === "Suite") head = i; });
    const first = ws.getRow(head + 1);
    expect(first.getCell(1).value).toBe("7010-1");
    expect((first.getCell(7).value as any).formula).toBe(`SUM(D${head + 1}:F${head + 1})`);
    expect((first.getCell(13).value as any).result).toBe(180);
    expect(first.getCell(15).value).toMatch(/2025 actual/);
    const tot = ws.getRow(head + 1 + rows.length);
    expect(tot.getCell(2).value).toBe("Total");
    expect((tot.getCell(12).value as any).result).toBe(1630);
  });
});

describe("billed today: the monthly statement first", () => {
  const rec = retail({ cam: 5783, ins: 163, ret: 2234 }, { reconOcc: 0.6932, escrow: { cam: 2000, ins: 160, ret: 2056 } });
  it("every charge off the statement month, U&O on its own line (Victra at 4500)", () => {
    const b = currentBilling({ billing: { cam: 900, ins: 0, ret: 300, uo: 234, stmt: { month: "2026-09", cam: 900, ins: 20, ret: 300, uo: 214, rent: 2000 } }, method: rec } as any);
    expect(b).toEqual({ cam: 900, ins: 20, ret: 300, uo: 214, month: "2026-09", differs: [], from: { cam: "statement", ins: "statement", ret: "statement" } });
  });
  it("a statement that disagrees with the rent roll is listed, and the statement wins", () => {
    const b = currentBilling({ billing: { cam: 900, ins: 40, ret: 300, stmt: { month: "2026-09", cam: 950, ins: 40, ret: 300 } } } as any)!;
    expect(b.cam).toBe(950);
    expect(b.differs).toEqual([{ part: "cam", statement: 950, rentRoll: 900 }]);
  });
  it("a charge the statement month has no line for falls back, and says so", () => {
    const b = currentBilling({ billing: { cam: 900, ins: 40, ret: 300, stmt: { month: "2026-09", cam: 900 } } } as any)!;
    expect(b.from).toEqual({ cam: "statement", ins: "rentroll", ret: "rentroll" });
    expect([b.ins, b.ret]).toEqual([40, 300]);
  });
  it("Fresh Grocer at 4500: no INS line → the 2025 recon's INS due rebuilt as the 2026 estimate ($8,336 → $700), not last year's $600 escrow", () => {
    const b = currentBilling({ billing: { cam: 23100, ins: 0, ret: 10000, uo: 700 }, method: retail({ cam: 286946, ins: 8336, ret: 109046 }, { escrow: { cam: 231600, ins: 7200, ret: 108000 } }) } as any)!;
    expect([b.ins, b.from.ins]).toEqual([700, "recon"]);
  });
  it("Philadelphia with no INS line: the recon's INS due, full-year, ÷ 12 ($163 at 69% → $20), the rest U&O", () => {
    const b = currentBilling({ billing: { cam: 900, ins: 0, ret: 300, uo: 234 }, method: rec } as any)!;
    expect([b.ins, b.uo, b.from.ins]).toEqual([20, 214, "recon"]);
  });
  it("McDonald's: $492 is all U&O — no INS escrow, no INS", () => {
    const b = currentBilling({ billing: { cam: 2214, ins: 0, ret: 0, uo: 492 }, method: retail({ cam: 0, ins: 0, ret: 0 }, { escrow: { cam: 26568, ins: 0, ret: 0 } }) } as any)!;
    expect([b.ins, b.uo]).toEqual([0, 492]);
  });
  it("outside Philadelphia with no statement, the rent roll's column IS insurance", () => {
    expect(currentBilling({ billing: { cam: 100, ins: 40, ret: 50 } } as any)).toMatchObject({ cam: 100, ins: 40, ret: 50, from: { ins: "rentroll" } });
  });
});

describe("an estimate set by hand IS the budget", () => {
  const mk = (): any => ({
    reconYear: 2025, budgetYear: 2027, ratios: { cam: 1, ins: 1, ret: 1 },
    tenants: [
      { unitRef: "7010-1", cam: m(500), ins: m(0), ret: m(200), camAnnual: 6000, insAnnual: 0, retAnnual: 2400 },
      { unitRef: "7010-2", cam: [...m(300).slice(0, 6), ...m(0).slice(0, 6)], ins: m(0), ret: m(0), camAnnual: 1800, insAnnual: 0, retAnnual: 0 },
    ],
    monthly: { cam: m(0), ins: m(0), ret: m(0) }, totals: {},
  });
  it("replaces that tenant's months, and the recovery lines move with it", () => {
    const est = applyEstimateOverrides(mk(), { "7010-1": { cam: 450, note: "Phase in the reassessment" } });
    const t = est.tenants[0];
    expect(t.cam).toEqual(m(450));
    expect(t.ret).toEqual(m(200)); // untouched
    expect(t.computed).toEqual({ cam: 500, ins: 0, ret: 200 });
    expect(t.overridden).toEqual({ cam: true });
    expect(est.monthly.cam[0]).toBe(750);   // 450 + 300
    expect(est.monthly.cam[11]).toBe(450);  // the June lease is gone
    expect(est.totals.camAnnual).toBe(450 * 12 + 1800);
  });
  it("only in the months the tenant is billed", () => {
    const est = applyEstimateOverrides(mk(), { "7010-2": { cam: 350, note: "x" } });
    expect(est.tenants[1].cam).toEqual([...m(350).slice(0, 6), ...m(0).slice(0, 6)]);
  });
  it("a cleared seed (an empty override) changes nothing", () => {
    const est = applyEstimateOverrides(mk(), { "7010-1": {} });
    expect(est.tenants[0].ret).toEqual(m(200));
    expect(est.tenants[0].overridden).toBeUndefined();
  });
  it("no overrides leaves the estimate alone", () => {
    const a = mk();
    expect(applyEstimateOverrides(a, {})).toBe(a);
    expect(a.tenants[0].computed).toBeUndefined();
  });
});

describe("no new monthly charges for an existing tenant", () => {
  const rows = estimateRows([
    // McDonald's at 4500: billed CAM today, no RET — owed $7,074 at the 2025 recon, $0 escrow.
    row({ unitRef: "4500-2851", tenant: "McDonald's", cam: m(1602), ret: m(693), billing: { cam: 1550, ins: 0, ret: 0 },
      method: retail({ cam: 20956, ins: 0, ret: 7074 }, { escrow: { cam: 26568, ins: 0, ret: 0 } }) }),
    // USPS: RET only, settled at reconciliation, billed nothing today.
    row({ unitRef: "4500-3005", tenant: "USPS", ret: m(296), billing: { cam: 0, ins: 0, ret: 0 },
      method: retail({ cam: 0, ins: 0, ret: 3080 }, { escrow: { cam: 0, ins: 0, ret: 0 } }) }),
    // A genuinely new lease — no recon, nothing billed — does start estimates.
    row({ unitRef: "4500-2893", tenant: "Newco", cam: m(250), method: { kind: "new", sqft: 1000, assumption: "nnn" } }),
  ] as any, est);
  it("McDonald's RET stays $0 a month — settled at reconciliation, the recovery kept in the budget", () => {
    const r = rows.find((x) => x.unitRef === "4500-2851")!;
    expect(r.next).toEqual({ cam: 1600, ins: 0, ret: 0, total: 1600 }); // $1,602 → nearest $5
    expect(r.annual).toEqual({ ret: 693 * 12 });
    expect(r.reason).toMatch(/^RET settled at reconciliation, not billed monthly/);
    expect(skylineEstimateRows(rows, 2027).filter((x) => x.unit === "4500-2851-CU" && x.amount).map((x) => x.chargeCode)).toEqual(["CAM"]);
  });
  it("USPS gets no monthly RET estimate, and nothing in the import", () => {
    const r = rows.find((x) => x.unitRef === "4500-3005")!;
    expect(r.next.total).toBe(0);
    expect(chargeRowsToCSV(skylineEstimateRows(rows, 2027))).not.toContain("4500-3005");
  });
  it("a new lease starts its estimates", () => {
    expect(rows.find((x) => x.unitRef === "4500-2893")!.next.cam).toBe(250);
  });
});

describe("2027 estimates end in 0 or 5", () => {
  it("rounds to the nearest $5", () => {
    expect([603, 602, 607.4, 608, 1602, 0].map(round5)).toEqual([605, 600, 605, 610, 1600, 0]);
  });
});

describe("a tenant's month off their statement lines", () => {
  const c = (dateISO: string | null, description: string, amount: number, category: any, extra: any = {}) => ({ dateISO, description, amount, category, ...extra });
  it("the newest month's charges by kind — not a year-end adjustment or a credit", () => {
    expect(statementMonthlyBilling([
      c("2026-08-01", "Base Rent", 2000, "rent"),
      c("2026-08-01", "INS Insurance", 20, "insurance"),
      c("2026-09-01", "Base Rent", 2000, "rent"),
      c("2026-09-01", "CAM Escrow", 900, "cam"),
      c("2026-09-01", "INS Insurance", 20, "insurance"),
      c("2026-09-01", "RET Escrow", 300, "ret"),
      c("2026-09-01", "U&O Tax", 214, "uando"),
      c("2026-04-30", "2025 CAM Adjustment", 90, "cam", { reconYear: 2025 }),
      c("2026-09-05", "Late fee", 50, "other"),
      c("2026-09-06", "CAM credit", -5, "cam"),
      c(null, "Open Credits", -100, "credit"),
    ] as any)).toEqual({ month: "2026-09", rent: 2000, cam: 900, ins: 20, ret: 300, uo: 214 });
  });
  it("nothing dated, nothing to read", () => {
    expect(statementMonthlyBilling([c(null, "Open Credits", -100, "credit")] as any)).toEqual({});
  });
});

describe("the operating statement's rent check in Philadelphia", () => {
  it("has no column to check an insurance line against (Other Expense is INS + U&O)", () => {
    expect(checkBasisForLine("Insurance", "4930-*", "4500")).toBeNull();
    expect(checkBasisForLine("Insurance", "4930-*", "9510")).toBe("other");
    expect(checkBasisForLine("Common Area", "4910-*", "4500")).toBe("cam");
  });
});
