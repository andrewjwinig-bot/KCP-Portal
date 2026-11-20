// WHAT EACH SHOPPING-CENTRE EXPENSE LINE RECOVERED — the retail recon's own
// figures, line by line (lib/cam/recoveries.ts for the shape). Pure.
//
// A tenant pays its PRS of every CAM line it is not excluded from, scaled by
// a lease cap and its occupancy, plus an admin fee on the lines the fee
// covers; its INS share of the property premium; its RET share less any
// discount (or a flat RET). Each line's expense − recovered is explained:
//   · Excluded by lease — tenants carved out of the line;
//   · Lease caps — the controllable growth a cap kept off;
//   · RET discount — the discount off a tenant's tax share;
//   · Gross leases — tenants who reconcile nothing;
//   · Admin fees — a NEGATIVE part (the fee adds to the recovery);
//   · Vacant & not billed — the remainder (vacancy, part-year, stipulated
//     shares under SF ÷ GLA).
// A tenant whose INS is billed on the Liability Insurance CAM line (Wawa at
// 2300 — `insPoolOverride`) is counted on THAT line, not the property premium.

import type { RetailBuildingResult, RetailExpensePool } from "./types";
import { addPart, addTenant, assembleGroup, finishRow, newRow, type RecoveryGroup, type RowAcc } from "../recoveries";

export const RETAIL_PARTS = {
  excluded: "Excluded by lease",
  cap: "Lease caps",
  discount: "RET discount",
  gross: "Gross leases",
  admin: "Admin fees",
  vacancy: "Vacant & not billed",
} as const;

const lc = (s: string) => s.trim().toLowerCase();

export function retailLineRecoveries(pool: RetailExpensePool, result: RetailBuildingResult, name: string, building = result.propertyCode): RecoveryGroup {
  const year = result.reconYear;
  const lines = pool.camLines.map((l, i) => newRow(`opex|${l.glAccount}|${i}`, l.glAccount, l.label, "opex", l.amount));
  const liabilityIdx = pool.camLines.findIndex((l) => /liability/i.test(l.label));
  const ins = newRow("ins", "", "Property Insurance", "ins", pool.insAmount);
  const ret = newRow("ret", "6410", "Real Estate Taxes", "ret", pool.retAmount);

  let reconciled = 0;
  for (const t of result.tenants) {
    reconciled += 1;
    const who = { unitRef: t.unitRef, name: t.name, building };
    const w = (t.camPrs / 100) * t.occPct;
    const excluded = new Set(t.camExcludedLabels.map(lc));
    const adminExcluded = new Set(t.adminExcludedLabels.map(lc));
    const billed = pool.camLines.map((l) => !excluded.has(lc(l.label)));
    const tenantPool = pool.camLines.reduce((s, l, i) => s + (billed[i] ? l.amount : 0), 0);
    const scale = tenantPool > 0 ? t.camPoolEffective / tenantPool : 1;
    const adminLines = pool.camLines.reduce((s, l, i) => s + (billed[i] && !adminExcluded.has(lc(l.label)) ? l.amount : 0), 0);

    pool.camLines.forEach((l, i) => {
      const acc = lines[i];
      if (t.grossLease) {
        addTenant(acc, who, 0);
        addPart(acc, RETAIL_PARTS.gross, w * l.amount);
        return;
      }
      if (!billed[i]) {
        addTenant(acc, who, 0);
        addPart(acc, RETAIL_PARTS.excluded, w * l.amount);
        return;
      }
      const share = w * l.amount * scale;
      const admin = adminLines > 0 && !adminExcluded.has(lc(l.label)) ? t.camAdmin * (l.amount / adminLines) : 0;
      addTenant(acc, who, share + admin);
      addPart(acc, RETAIL_PARTS.cap, w * l.amount * (1 - scale));
      addPart(acc, RETAIL_PARTS.admin, -admin);
    });

    // Insurance: the property premium, or the liability line where the
    // tenant's INS is billed on it.
    const onLiability = t.insPool !== pool.insAmount && liabilityIdx >= 0;
    const insAcc: RowAcc = onLiability ? lines[liabilityIdx] : ins;
    if (t.grossLease) {
      addTenant(ins, who, 0);
      addPart(ins, RETAIL_PARTS.gross, (t.insPrs / 100) * t.occPct * pool.insAmount);
    } else if (onLiability) {
      addTenant(insAcc, who, t.insDue, false);
      addTenant(ins, who, 0);
    } else {
      addTenant(ins, who, t.insDue);
    }

    // Real estate taxes.
    if (t.grossLease) {
      addTenant(ret, who, 0);
      addPart(ret, RETAIL_PARTS.gross, (t.retPrs / 100) * t.occPct * pool.retAmount);
    } else {
      addTenant(ret, who, t.retDue);
      if (t.flatRet == null) addPart(ret, RETAIL_PARTS.discount, (t.retPrs / 100) * t.occPct * pool.retAmount * (t.retDiscountPct / 100));
    }
  }

  return assembleGroup(
    { code: result.propertyCode, name, year, kind: "retail" },
    lines.map((l) => finishRow(l, RETAIL_PARTS.vacancy)),
    [finishRow(ins, RETAIL_PARTS.vacancy), finishRow(ret, RETAIL_PARTS.vacancy)],
    reconciled,
  );
}
