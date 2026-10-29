// The settlement as plain-text lines — the approval email and the "Move-out
// finalized" email print the same block, so the two cannot disagree with each
// other or with the PDF's settlement page.

import type { MoveoutSettlement } from "./deposit";
import { escrowNote } from "./openAr";

const money = (n: number) => "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateUS = (iso: string | null) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : null;
};

export function settlementLines(s: MoveoutSettlement, cats: string): string[] {
  const out: string[] = [];
  out.push(`Final ${cats} reconciliation: ${money(s.reconBalance)} ${s.reconBalance >= 0 ? "due from the tenant" : "credit to the tenant"}`);
  if (s.openAr) {
    const asOf = dateUS(s.openAr.asOf);
    out.push(`Open balance on account${asOf ? ` (as of ${asOf})` : ""}: ${money(s.openAr.balance)}${s.openAr.balance < 0 ? " credit" : ""}`);
    const n = escrowNote(s.openAr);
    if (n) out.push(`  ${n}`);
  } else {
    out.push(`Open balance on account: no monthly statement on file for this tenant — check Skyline.`);
  }
  out.push(`Total due: ${money(s.totalDue)}${s.totalDue < 0 ? " credit" : ""}`);
  const dep = s.deposit;
  if (dep && dep.net != null) {
    out.push(`Security deposit on file: ${money(dep.amount)}${dep.status === "partial" ? " (partially refunded)" : ""}`);
    out.push(`Net settlement: ${money(dep.net)} ${dep.net >= 0 ? "to be refunded to the tenant" : "still due from the tenant"}`);
  } else if (dep) {
    out.push(`Security deposit: ${money(dep.amount)} — ${dep.status} (not netted into the settlement).`);
  } else {
    out.push(`No security deposit is on record for this unit.`);
  }
  return out;
}
