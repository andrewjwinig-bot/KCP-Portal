// Reads everything a property's quarterly workpapers need — the GL, its
// transactions, and the independent sources each balance is checked against —
// and runs the pure engine. The page and the Excel download both call this,
// so they cannot disagree.

import "server-only";
import { assembledGlConsolidated, assembledTransactions, transactionDetail, listGls, mergeAccountNames } from "@/lib/financials/operating-statements/statementStore";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { getBsOverrides } from "@/lib/financials/balance-sheet/overrideStore";
import { glKeysFor } from "@/lib/financials/cash-analysis/funds";
import { listLoans } from "@/lib/debt/storage";
import { scheduleBalanceAt } from "@/lib/debt/amortization";
import { listDeposits } from "@/lib/deposits/storage";
import { heldAmount } from "@/lib/deposits/deposits";
import { runFor } from "@/lib/bank-rec/store";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { computeWorkpapers, type Workpapers } from "./compute";

export type WpMeta = { key: string; name: string; entityName: string; ein: string | null };

export async function loadWorkpapers(key: string, year: number, asOfMonth: number): Promise<{ wp: Workpapers; meta: WpMeta; coverageEnd: number } | null> {
  const gl = await assembledGlConsolidated(key, year);
  if (!gl) return null;
  const metas = await listGls();
  const names = { ...mergeAccountNames(metas), ...(gl.names ?? {}) };
  const detail = await transactionDetail(key, year);
  const transactions = detail === "lean" || detail === "none" ? null : await assembledTransactions(key, year);
  const asOfDate = `${year}-${String(asOfMonth).padStart(2, "0")}-${new Date(Date.UTC(year, asOfMonth, 0)).getUTCDate()}`;

  // Lender schedule — every loan must speak to the date, or none is compared.
  const loans = (await listLoans()).filter((l) => l.property === key);
  const balances = loans.map((l) => scheduleBalanceAt(l, asOfDate));
  const debtPrincipal = loans.length && balances.every((b) => b != null)
    ? { amount: Math.round(balances.reduce((t: number, b) => t + (b ?? 0), 0) * 100) / 100, loans: loans.length }
    : null;

  // Deposits register — what we hold for this property's tenants.
  const members = new Set(glKeysFor(key));
  const deposits = (await listDeposits().catch(() => [])).filter((d) => members.has(d.propertyCode));
  const depositsHeld = deposits.length ? Math.round(deposits.reduce((t, d) => t + heldAmount(d), 0) * 100) / 100 : null;

  // Bank rec for the quarter-end month, when one was run.
  const period = `${year}-${String(asOfMonth).padStart(2, "0")}`;
  const run = await runFor(period).catch(() => null);
  const check = run?.gl.find((g) => g.glKey === key);
  const bankRec = check ? { period, skyline: check.skyline, gl: check.gl, difference: check.difference, signedOff: !!run?.signedOff } : null;

  const wp = computeWorkpapers({
    key, year, asOfMonth,
    gl: { beginning: gl.beginning, monthly: gl.monthly, names, coverageStartMonth: gl.coverageStartMonth },
    transactions,
    overrides: await getBsOverrides(key),
    sources: { debtPrincipal, depositsHeld, bankRec },
  });
  const def = PROPERTY_DEFS.find((d) => d.id === key);
  const entityName = (await availableStatements()).find((p) => p.key === key)?.entityName ?? def?.name ?? key;
  return {
    wp,
    meta: { key, name: def?.name ?? entityName, entityName, ein: def?.ein ?? null },
    coverageEnd: Math.min(12, gl.coverageEnd ?? gl.maxPeriodInFile ?? 12),
  };
}
