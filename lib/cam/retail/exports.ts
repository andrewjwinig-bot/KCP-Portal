// Retail Skyline exports — the year-end true-up upload. One row per tenant
// per category (CAM / INS / RET), amount = the reconciled balance (negative =
// credit to the tenant). Mirrors the office year-end format (unit "<ref>-CU",
// one-time charge). Charge codes: YEC (CAM), YEI (INS), YER (RET).

import type { SkylineChargeRow } from "../office/exports";
import type { RetailBuildingResult } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function retailYearEndRows(result: RetailBuildingResult, effectiveDateISO: string): SkylineChargeRow[] {
  const year = result.reconYear;
  const mk = (unitRef: string, seq: number, code: string, label: string, amount: number): SkylineChargeRow => ({
    unit: `${unitRef}-CU`,
    seq,
    chargeCode: code,
    chargeDescription: `${year} ${label}`,
    freq: "O",
    effectiveDate: effectiveDateISO,
    endDate: "",
    amount: round2(amount),
  });
  const cam = result.tenants.map((t) => mk(t.unitRef, 2, "YEC", "Year End CAM Adjustment", t.camBalance));
  const ins = result.tenants.map((t) => mk(t.unitRef, 3, "YEI", "Year End INS Adjustment", t.insBalance));
  const ret = result.tenants.map((t) => mk(t.unitRef, 4, "YER", "Year End RET Adjustment", t.retBalance));
  return [...cam, ...ins, ...ret];
}
