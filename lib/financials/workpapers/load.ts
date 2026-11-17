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
import { getApAging } from "./apAgingStore";
import { getArAging } from "./arAgingStore";
import { invoicesNotInBooks } from "./apAging";

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

  // Skyline's vendor aging at the quarter end, for this property (a fund sums
  // its buildings' sections, as its General Ledger does).
  const aging = await getApAging(asOfDate).catch(() => null);
  const apSections = aging ? [...members].map((k) => aging.sections[k]).filter(Boolean) : [];
  let apAging: { asOf: string; total: number; invoices: number; notInBooks: { vendor: string; date: string | null; amount: number }[] } | null = null;
  if (aging && apSections.length) {
    const invoices = apSections.flatMap((s) => s.invoices);
    const credits = Object.entries(transactions ?? {})
      .filter(([code]) => /^211\d-/.test(code))
      .flatMap(([, list]) => list.filter((t) => t.month <= asOfMonth && t.amount < 0).map((t) => ({ amount: t.amount, text: `${t.vendor ?? ""} ${t.description}`, month: t.month })));
    apAging = {
      asOf: aging.asOf,
      total: Math.round(apSections.reduce((t, s) => t + s.total, 0) * 100) / 100,
      invoices: invoices.length,
      // Only this year's invoices can be looked for in this year's postings —
      // an older one sits in the opening balance.
      notInBooks: transactions ? invoicesNotInBooks(invoices.filter((i) => !i.date || i.date >= `${year}-01-01`), credits).map((i) => ({ vendor: i.vendor, date: i.date, amount: i.amount })) : [],
    };
  }

  // Skyline's tenant aging at the quarter end (a fund sums its buildings).
  const arRec = await getArAging(asOfDate).catch(() => null);
  const arSecs = arRec ? [...members].map((k) => arRec.sections[k]).filter(Boolean) : [];
  const arAging = arSecs.length ? {
    asOf: arRec!.asOf,
    total: Math.round(arSecs.reduce((t, s) => t + s.total, 0) * 100) / 100,
    charges: Math.round(arSecs.reduce((t, s) => t + s.charges, 0) * 100) / 100,
    credits: Math.round(arSecs.reduce((t, s) => t + s.credits, 0) * 100) / 100,
    tenants: arSecs.reduce((t, s) => t + s.tenants.length, 0),
    top: arSecs.flatMap((s) => s.tenants).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 25),
  } : null;

  const wp = computeWorkpapers({
    key, year, asOfMonth,
    gl: { beginning: gl.beginning, monthly: gl.monthly, names, coverageStartMonth: gl.coverageStartMonth },
    transactions,
    overrides: await getBsOverrides(key),
    sources: { debtPrincipal, depositsHeld, bankRec, apAging, arAging },
  });
  const def = PROPERTY_DEFS.find((d) => d.id === key);
  const entityName = (await availableStatements()).find((p) => p.key === key)?.entityName ?? def?.name ?? key;
  return {
    wp,
    meta: { key, name: def?.name ?? entityName, entityName, ein: def?.ein ?? null },
    coverageEnd: Math.min(12, gl.coverageEnd ?? gl.maxPeriodInFile ?? 12),
  };
}
