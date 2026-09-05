// Skyline upload formatters. Two exports come out of a finalized office
// reconciliation, both matching the column layout the CAM workbook pastes
// into Skyline:
//
//   1. Year End Adjustments — the one-time true-up. Charge code YEC (CAM)
//      / YER (RET), amount = the tenant's reconciled balance (negative =
//      credit). Pasted into Property Management → Data Import → Unit Charges.
//
//   2. CAM/RET Estimate — next year's recurring monthly estimate. Charge
//      code CAM / RET, monthly amount = ROUND(thisYearAmountDue rounded to
//      the nearest $10, then /12 to the nearest $10). Staff may override the
//      monthly figure before upload.

import type { BuildingReconResult, TenantReconResult } from "./types";

/** Excel ROUND(x, digits): half away from zero, digits may be negative
 *  (e.g. -1 → nearest 10). */
export function excelRound(x: number, digits: number): number {
  const f = Math.pow(10, digits);
  const v = x * f;
  const r = (v < 0 ? -1 : 1) * Math.round(Math.abs(v) + 1e-9);
  return r / f;
}

export type SkylineChargeRow = {
  unit: string;
  seq: number;
  chargeCode: string;
  chargeDescription: string;
  /** "O" one-time, "M" monthly. */
  freq: "O" | "M";
  effectiveDate: string; // ISO yyyy-mm-dd
  endDate: string; // usually blank
  amount: number;
};

/** Year-End Adjustment rows (the true-up). One YEC + one YER per tenant. */
export function yearEndAdjustmentRows(
  result: BuildingReconResult,
  effectiveDateISO: string,
): SkylineChargeRow[] {
  const year = result.reconYear;
  const cam: SkylineChargeRow[] = result.tenants.map((t) => ({
    unit: t.skylineUnit,
    seq: 2,
    chargeCode: "YEC",
    chargeDescription: `${year} Year End CAM Adjustment`,
    freq: "O",
    effectiveDate: effectiveDateISO,
    endDate: "",
    amount: round2(t.opexBalance),
  }));
  const ret: SkylineChargeRow[] = result.tenants.map((t) => ({
    unit: t.skylineUnit,
    seq: 3,
    chargeCode: "YER",
    chargeDescription: `${year} Year End RET Adjustment`,
    freq: "O",
    effectiveDate: effectiveDateISO,
    endDate: "",
    amount: round2(t.retBalance),
  }));
  return [...cam, ...ret];
}

export type NextYearEstimate = {
  unitRef: string;
  skylineUnit: string;
  name: string;
  annualCam: number;
  monthlyCam: number;
  annualRet: number;
  monthlyRet: number;
};

/** Next-year recurring estimate per tenant, derived from this year's amount
 *  due (rounded to the nearest $10, then /12 to the nearest $10). */
export function nextYearEstimate(t: TenantReconResult): NextYearEstimate {
  const annualCam = excelRound(t.opexAmountDue, -1);
  const annualRet = excelRound(t.retAmountDue, -1);
  return {
    unitRef: t.unitRef,
    skylineUnit: t.skylineUnit,
    name: t.name,
    annualCam,
    monthlyCam: excelRound(annualCam / 12, -1),
    annualRet,
    monthlyRet: excelRound(annualRet / 12, -1),
  };
}

/** Recurring CAM/RET estimate upload rows for the year following reconYear.
 *  `overrides` lets staff replace a computed monthly figure by unitRef. */
export function estimateChargeRows(
  result: BuildingReconResult,
  effectiveDateISO: string,
  overrides: Record<string, { monthlyCam?: number; monthlyRet?: number }> = {},
): SkylineChargeRow[] {
  const nextYear = result.reconYear + 1;
  const rows: SkylineChargeRow[] = [];
  for (const t of result.tenants) {
    const est = nextYearEstimate(t);
    const o = overrides[t.unitRef] ?? {};
    const camMonthly = o.monthlyCam ?? est.monthlyCam;
    const retMonthly = o.monthlyRet ?? est.monthlyRet;
    rows.push({
      unit: t.skylineUnit, seq: 2, chargeCode: "CAM",
      chargeDescription: `${nextYear} CAM Estimate`, freq: "M",
      effectiveDate: effectiveDateISO, endDate: "", amount: camMonthly,
    });
    rows.push({
      unit: t.skylineUnit, seq: 3, chargeCode: "RET",
      chargeDescription: `${nextYear} RET Estimate`, freq: "M",
      effectiveDate: effectiveDateISO, endDate: "", amount: retMonthly,
    });
  }
  return rows;
}

/** Serialize Skyline rows to CSV (no header — Skyline import expects values
 *  only). Drops $0 rows, matching the workbook's "clear blank/$0 rows" step. */
export function chargeRowsToCSV(rows: SkylineChargeRow[], dropZero = true): string {
  return rows
    .filter((r) => !dropZero || r.amount !== 0)
    .map((r) =>
      [r.unit, r.seq, r.chargeCode, r.chargeDescription, r.freq, r.effectiveDate, r.endDate, r.amount]
        .join(","),
    )
    .join("\n");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
