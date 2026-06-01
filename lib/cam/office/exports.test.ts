import { describe, it, expect } from "vitest";
import { reconcileBuilding } from "./compute";
import { POOL_4070, TENANTS_4070_2025 } from "./seed/4070";
import {
  excelRound,
  yearEndAdjustmentRows,
  nextYearEstimate,
  estimateChargeRows,
} from "./exports";

const result = reconcileBuilding(POOL_4070, TENANTS_4070_2025, 2025);
const byUnit = Object.fromEntries(result.tenants.map((t) => [t.unitRef, t]));

describe("excelRound", () => {
  it("rounds to nearest 10 (digits = -1), half away from zero", () => {
    expect(excelRound(549.46, -1)).toBe(550);
    expect(excelRound(45.83, -1)).toBe(50);
    expect(excelRound(225.33, -1)).toBe(230);
    expect(excelRound(19.17, -1)).toBe(20);
  });
});

describe("Year End Adjustments export", () => {
  const rows = yearEndAdjustmentRows(result, "2026-04-30");
  it("emits a YEC row matching the Year End Adjustments tab", () => {
    const yec = rows.find((r) => r.unit === "4070-103-CU" && r.chargeCode === "YEC")!;
    expect(yec).toMatchObject({
      seq: 2, freq: "O", chargeDescription: "2025 Year End CAM Adjustment", amount: -1550.54,
    });
  });
  it("emits a YER row matching the Year End Adjustments tab", () => {
    const yer = rows.find((r) => r.unit === "4070-103-CU" && r.chargeCode === "YER")!;
    expect(yer).toMatchObject({
      seq: 3, freq: "O", chargeDescription: "2025 Year End RET Adjustment", amount: 105.33,
    });
  });
  it("Mette RET is a credit (negative)", () => {
    const yer = rows.find((r) => r.unit === "4070-400-CU" && r.chargeCode === "YER")!;
    expect(yer.amount).toBe(-466.36);
  });
});

describe("Next-year estimate", () => {
  it("Bucks County ties to CAM EST BILLING tab (550/50 CAM, 230/20 RET)", () => {
    const est = nextYearEstimate(byUnit["4070-103"]);
    expect(est).toMatchObject({ annualCam: 550, monthlyCam: 50, annualRet: 230, monthlyRet: 20 });
  });
  it("Veltri 415 ties out (5860/490 CAM, 2400/200 RET)", () => {
    const est = nextYearEstimate(byUnit["4070-415"]);
    expect(est).toMatchObject({ annualCam: 5860, monthlyCam: 490, annualRet: 2400, monthlyRet: 200 });
  });
  it("estimate rows carry next year's description + monthly freq", () => {
    const rows = estimateChargeRows(result, "2026-01-01");
    const cam = rows.find((r) => r.unit === "4070-103-CU" && r.chargeCode === "CAM")!;
    expect(cam).toMatchObject({ seq: 2, freq: "M", chargeDescription: "2026 CAM Estimate", amount: 50 });
  });
});
