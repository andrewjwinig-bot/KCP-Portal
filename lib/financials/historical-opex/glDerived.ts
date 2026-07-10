// Operating-expense history derived from the imported GLs.
//
// The manual Operating Expense History store holds the office properties'
// long-run actuals (from CAM workbooks). This fills in every OTHER property
// from the general ledgers already uploaded for Operating Statements — reusing
// the same line mapping (expense sections only), so a property's expense
// history is the annual total of each expense line, per year, straight off its
// GL. One set of imported documents feeds both views.

import "server-only";
import { listFullGls, type StoredGl } from "@/lib/financials/operating-statements/statementStore";
import { getMapping } from "@/lib/financials/operating-statements/mappingStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { claimAccounts } from "@/lib/financials/operating-statements/mask";
import { EXPENSE_ROLES } from "@/lib/financials/operating-statements/types";
import type { HistoricalOpExEntry } from "./types";

/** Annual expense-line totals, per property, per year, from every uploaded GL.
 *  Expense lines only (roleSign = +1, so the GL debit-normal nets are already
 *  display-positive). Keyed to the mapping's propertyCode so it aligns with the
 *  manual store. Fund shells are never uploaded directly, so iterating stored
 *  GL keys naturally covers member buildings without double-counting. */
export async function glDerivedOpEx(): Promise<HistoricalOpExEntry[]> {
  const gls = await listFullGls();
  // Group each property's uploads by year.
  const byKeyYear = new Map<string, Map<number, StoredGl[]>>();
  for (const g of gls) {
    let ym = byKeyYear.get(g.key);
    if (!ym) byKeyYear.set(g.key, (ym = new Map()));
    let arr = ym.get(g.year);
    if (!arr) ym.set(g.year, (arr = []));
    arr.push(g);
  }

  const stamp = new Date().toISOString();
  const out = new Map<string, HistoricalOpExEntry>(); // `${propertyCode}::${label}`
  for (const [key, ym] of byKeyYear) {
    const mapping = await getMapping(key);
    if (!mapping) continue;
    const expenseSections = mapping.sections.filter((s) => EXPENSE_ROLES.includes(s.role));
    if (!expenseSections.length) continue;
    for (const [year, arr] of ym) {
      const asm = assembleGls(arr);
      if (!asm) continue;
      const accounts = Object.keys(asm.monthly);
      for (const sec of expenseSections) {
        // Claim each account to its most-specific line so a catch-all mask
        // (e.g. G&A "8*-*") doesn't re-count accounts owned by a specific line —
        // matching the operating statement engine.
        const claimed = claimAccounts(sec.lines.map((l) => l.mask), accounts);
        sec.lines.forEach((line, li) => {
          // Full-year total: sum the line's claimed accounts' 12 monthly nets
          // (expense sign is +1, so debit-normal nets are already positive).
          let annual = 0;
          for (const acct of claimed[li]) annual += (asm.monthly[acct] ?? []).reduce((a, n) => a + n, 0);
          if (Math.abs(annual) < 0.5) return;
          const k = `${mapping.propertyCode}::${line.label}`;
          const entry = out.get(k) ?? {
            propertyCode: mapping.propertyCode,
            lineLabel: line.label,
            glAccount: line.mask,
            yearly: {} as Record<string, number>,
            source: "GL import",
            updatedAt: stamp,
          };
          entry.yearly[String(year)] = Math.round(annual);
          out.set(k, entry);
        });
      }
    }
  }
  return [...out.values()];
}

/** Merge manual (office) history with GL-derived history. Manual is
 *  authoritative and untouched; GL-derived entries are added only for
 *  properties the manual store doesn't already cover. */
export function mergeOpEx(
  manual: HistoricalOpExEntry[],
  derived: HistoricalOpExEntry[],
): HistoricalOpExEntry[] {
  const manualCodes = new Set(manual.map((e) => e.propertyCode.toUpperCase()));
  return [...manual, ...derived.filter((e) => !manualCodes.has(e.propertyCode.toUpperCase()))];
}
