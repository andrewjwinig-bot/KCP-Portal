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
import { arSections, coversEveryBalance } from "./arAging";
import { allAgingSnapshots } from "@/lib/statements/agingStore";
import { getRun } from "@/lib/statements/store";
import { invoicesNotInBooks } from "./apAging";

type ComputeArAging = NonNullable<NonNullable<Parameters<typeof computeWorkpapers>[0]["sources"]>["arAging"]> | null;

export type WpMeta = { key: string; name: string; entityName: string; ein: string | null };

/** One report or record the quarter's workpapers are checked against. */
export type WpSourceItem = {
  id: "gl" | "ar" | "ap" | "bank" | "debt" | "deposits";
  label: string;
  /** done = in hand for this quarter; missing = still to import / run;
   *  review = in hand but not finished; na = this property has no such account. */
  status: "done" | "missing" | "review" | "na";
  detail: string;
  /** The page that produces it (none for the agings — they import here). */
  href?: string;
};

export async function loadWorkpapers(key: string, year: number, asOfMonth: number): Promise<{ wp: Workpapers; meta: WpMeta; coverageEnd: number; checklist: WpSourceItem[] } | null> {
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
  // Its own import first; else a Credit Balance report already imported on
  // Receivables / Open Credits for the same date, if it was run for every
  // balance (a credits-only run cannot prove what tenants owe).
  const arRec = await getArAging(asOfDate).catch(() => null);
  let arCreditsOnly = !!arRec?.creditsOnly;
  let arSecs = arRec && !arRec.creditsOnly ? [...members].map((k) => arRec.sections[k]).filter(Boolean) : [];
  let arFrom: "workpapers" | "receivables" | null = arSecs.length ? "workpapers" : null;
  if (!arSecs.length) {
    const snap = (await allAgingSnapshots().catch(() => []))
      .filter((sn) => sn.asOf === asOfDate && sn.propertyCodes.some((c) => members.has(c)))
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt))[0];
    if (snap && coversEveryBalance(snap.tenants)) {
      arCreditsOnly = false;
      const mine = snap.tenants.filter((t) => members.has(t.propertyCode));
      const secs = arSections(mine);
      // A property on the report with no tenant owing anything is a real $0.
      arSecs = snap.propertyCodes.filter((c) => members.has(c)).map((c) => secs[c] ?? { code: c, total: 0, charges: 0, credits: 0, tenants: [] });
      arFrom = "receivables";
    } else if (snap) arCreditsOnly = true;
  }
  let arAging: ComputeArAging = arSecs.length ? {
    asOf: asOfDate,
    total: Math.round(arSecs.reduce((t, s) => t + s.total, 0) * 100) / 100,
    charges: Math.round(arSecs.reduce((t, s) => t + s.charges, 0) * 100) / 100,
    credits: Math.round(arSecs.reduce((t, s) => t + s.credits, 0) * 100) / 100,
    tenants: arSecs.reduce((t, s) => t + s.tenants.length, 0),
    top: arSecs.flatMap((s) => s.tenants).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 25),
  } : null;
  // No aging as of the quarter end: the Laser Statement for the month after it
  // (run in its first days) is every tenant's open items — an approximate check.
  let arLaser: { period: string; runOn: string } | null = null;
  if (!arAging) {
    const next = asOfMonth === 12 ? `${year + 1}-01` : `${year}-${String(asOfMonth + 1).padStart(2, "0")}`;
    const run = await getRun(next).catch(() => null);
    const mine = (run?.statements ?? []).filter((t) => members.has(t.propertyCode));
    const runOn = mine.map((t) => (t.exportedAt ?? t.importedAt ?? "").slice(0, 10)).filter(Boolean).sort().pop() ?? null;
    const windowEnd = new Date(Date.UTC(year, asOfMonth, 0) + 31 * 86400000).toISOString().slice(0, 10);
    if (mine.length && runOn && runOn > asOfDate && runOn <= windowEnd) {
      const bal = (t: { reportedBalance: number; noOpenItems?: boolean }) => (t.noOpenItems ? 0 : t.reportedBalance);
      const r2 = (n: number) => Math.round(n * 100) / 100;
      arLaser = { period: next, runOn };
      arAging = {
        asOf: runOn,
        total: r2(mine.reduce((a, t) => a + bal(t), 0)),
        charges: r2(mine.filter((t) => bal(t) > 0).reduce((a, t) => a + bal(t), 0)),
        credits: r2(mine.filter((t) => bal(t) < 0).reduce((a, t) => a + bal(t), 0)),
        tenants: mine.length,
        top: mine.map((t) => ({ unitRef: t.unitRef, tenantName: t.tenantName, balance: r2(bal(t)), former: /-FO$/i.test(t.skylineUnitRef ?? "") }))
          .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 25),
        approximate: arLaser,
      };
    }
  }

  const wp = computeWorkpapers({
    key, year, asOfMonth,
    gl: { beginning: gl.beginning, monthly: gl.monthly, names, coverageStartMonth: gl.coverageStartMonth },
    transactions,
    overrides: await getBsOverrides(key),
    sources: { debtPrincipal, depositsHeld, bankRec, apAging, arAging },
  });
  const def = PROPERTY_DEFS.find((d) => d.id === key);
  const entityName = (await availableStatements()).find((p) => p.key === key)?.entityName ?? def?.name ?? key;
  const coverageEnd = Math.min(12, gl.coverageEnd ?? gl.maxPeriodInFile ?? 12);

  // The reports this quarter is proven against, and which are still owed.
  const has = (re: RegExp) => wp.schedules.some((s) => re.test(s.code));
  const asOfShort = `${asOfMonth}/${asOfDate.slice(8)}/${year}`;
  const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const checklist: WpSourceItem[] = [
    {
      id: "gl", label: "Detailed General Ledger", href: "/financials/operating-statements",
      status: coverageEnd >= asOfMonth ? "done" : "missing",
      detail: coverageEnd >= asOfMonth ? `Through ${MONTH[asOfMonth - 1]} ${year}` : `Only through ${MONTH[coverageEnd - 1]} — import through ${MONTH[asOfMonth - 1]}`,
    },
    {
      id: "ar", label: "Credit Balance",
      status: !has(/^042\d-/) ? "na" : arAging ? "done" : "missing",
      detail: !has(/^042\d-/) ? "No tenant receivables on this ledger"
        : arLaser ? `Approximate — the Laser Statement run ${arLaser.runOn.slice(5, 7)}/${arLaser.runOn.slice(8)}/${arLaser.runOn.slice(0, 4)}; for an exact tie, the Credit Balance report as of ${asOfShort}`
        : arAging ? `As of ${asOfShort} · ${arAging.tenants} tenant${arAging.tenants === 1 ? "" : "s"}${arFrom === "receivables" ? " · from the Receivables import" : ""}`
        : arCreditsOnly ? `The ${asOfShort} report imported lists only tenants holding a credit — re-run it for every tenant with a balance`
        : `Not imported as of ${asOfShort} — every tenant with a balance`,
    },
    {
      id: "ap", label: "AP Aged Trial Balance (PDF)",
      status: !has(/^211\d-/) ? "na" : apAging ? "done" : "missing",
      detail: !has(/^211\d-/) ? "No accounts payable on this ledger"
        : apAging ? `As of ${asOfShort} · ${apAging.invoices} invoice${apAging.invoices === 1 ? "" : "s"}`
        : `Not imported as of ${asOfShort}`,
    },
    {
      id: "bank", label: "Statement Reconcile Report (PDF)", href: "/bank-rec/reconcile",
      status: !wp.schedules.some((s) => s.kind === "cash") ? "na" : !bankRec ? "missing" : bankRec.signedOff ? "done" : "review",
      detail: !wp.schedules.some((s) => s.kind === "cash") ? "No cash accounts on this ledger"
        : !bankRec ? `${MONTH[asOfMonth - 1]} ${year} not reconciled in the portal`
        : bankRec.signedOff ? `${MONTH[asOfMonth - 1]} ${year} signed off` : `${MONTH[asOfMonth - 1]} ${year} run, not signed off`,
    },
    {
      id: "debt", label: "Debt Tracker", href: "/debt",
      status: !loans.length ? "na" : debtPrincipal ? "done" : "review",
      detail: !loans.length ? "No loans on file for this property"
        : debtPrincipal ? `${loans.length} loan${loans.length === 1 ? "" : "s"} · balance at ${asOfShort}`
        : "A loan's schedule doesn't reach the quarter end",
    },
    {
      id: "deposits", label: "Security Deposits register", href: "/deposits",
      status: !wp.schedules.some((s) => s.kind === "sdPayable") && depositsHeld == null ? "na" : depositsHeld != null ? "done" : "missing",
      detail: depositsHeld != null ? `${deposits.length} deposit${deposits.length === 1 ? "" : "s"} on file` : !wp.schedules.some((s) => s.kind === "sdPayable") ? "No deposits liability on this ledger" : "No deposits on file",
    },
  ];

  return {
    wp,
    meta: { key, name: def?.name ?? entityName, entityName, ein: def?.ein ?? null },
    coverageEnd,
    checklist,
  };
}
