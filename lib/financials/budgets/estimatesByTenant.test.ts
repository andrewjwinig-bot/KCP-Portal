import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { estimateRows, estimateTotals, skylineEstimateRows, currentBilling } from "./estimatesByTenant";
import { buildEstimatesXlsx } from "./estimatesExport";
import { applyEstimateOverrides, seededEstimateOverrides } from "./estimateOverrides";
import { chargeRowsToCSV } from "@/lib/cam/office/exports";

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
  it("Skyline: the CAM recon's recurring-charge format, computed estimates to the nearest $10", () => {
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

describe("Philadelphia: the roll's Other Expense is INS + U&O", () => {
  it("Victra at 4500: $234 = $20 INS (the recon's $160 escrow over 8 months) + $214 U&O", () => {
    const b = currentBilling({ billing: { cam: 900, ins: 0, ret: 300, uo: 234 }, method: retail({ cam: 0, ins: 0, ret: 0 }, { reconOcc: 0.6932, escrow: { cam: 2000, ins: 160, ret: 2056 } }) } as any);
    expect(b).toEqual({ cam: 900, ins: 20, ret: 300, uo: 214 });
  });
  it("McDonald's: $492 is all U&O — no INS escrow, no INS", () => {
    const b = currentBilling({ billing: { cam: 2214, ins: 0, ret: 0, uo: 492 }, method: retail({ cam: 0, ins: 0, ret: 0 }, { escrow: { cam: 26568, ins: 0, ret: 0 } }) } as any);
    expect(b).toEqual({ cam: 2214, ins: 0, ret: 0, uo: 492 });
  });
  it("outside Philadelphia the column IS insurance", () => {
    expect(currentBilling({ billing: { cam: 100, ins: 40, ret: 50 } } as any)).toEqual({ cam: 100, ins: 40, ret: 50 });
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
  it("McDonald's at Gray's Ferry is billed no monthly RET (annual, at reconciliation)", () => {
    expect(seededEstimateOverrides(2027, "4500")["4500-2851"]).toEqual(expect.objectContaining({ ret: 0 }));
    expect(seededEstimateOverrides(2026, "4500")).toEqual({});
    const est = applyEstimateOverrides(mk(), { "7010-1": { ret: 0, note: "annual" } });
    expect(est.tenants[0].ret).toEqual(m(0));
    expect(est.tenants[0].cam).toEqual(m(500));
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
