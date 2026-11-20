// Put held balances back into a carryover ledger (pure). Used by the 10/19/26
// repair: a full-year GL billed Oct–Dec 2025 again, and December's year-end
// sweep billed every balance held through August 2026 on those invoices —
// which were then deleted in AvidXchange. Those balances are still owed, so
// they go back on the ledger beside whatever is held now (September's), per
// property and account, and bill when they cross $100 (or in December).

import type { CarryoverLedger, PropertyCarry } from "./carryover";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function restoreHeld(current: CarryoverLedger, restored: Record<string, PropertyCarry>, nowISO: string): CarryoverLedger {
  const balances: Record<string, PropertyCarry> = {};
  for (const [pid, pc] of Object.entries(current.balances)) balances[pid] = { ...pc, accounts: { ...pc.accounts } };
  for (const [pid, pc] of Object.entries(restored)) {
    for (const ac of Object.values(pc.accounts)) {
      if (Math.abs(ac.heldTotal) < 0.005) continue;
      if (!balances[pid]) balances[pid] = { propertyId: pid, accounts: {}, updatedAt: nowISO };
      const cur = balances[pid].accounts[ac.accountCode];
      balances[pid].accounts[ac.accountCode] = cur
        ? {
          ...cur,
          heldTotal: round2(cur.heldTotal + ac.heldTotal),
          months: [...ac.months, ...cur.months].sort((a, b) => a.statementMonth.localeCompare(b.statementMonth)),
          sinceMonth: [cur.sinceMonth, ac.sinceMonth].filter(Boolean).sort()[0],
          updatedAt: nowISO,
        }
        : { ...ac, updatedAt: nowISO };
      balances[pid].updatedAt = nowISO;
    }
  }
  return { ...current, balances, updatedAt: nowISO };
}
