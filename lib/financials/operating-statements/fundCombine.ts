// A fund's GL (PJV3 / PNIPLX) = its SHELL plus its member buildings — EXCEPT
// in a month the shell's upload is ITSELF the roll-up of the buildings.
//
// Skyline can export the fund entity two ways: the shell alone (swept cash,
// fund-level debt — no tenants), or the fund consolidated with every building
// beneath it. Summed with the buildings' own GLs, the consolidated export
// counts every building twice: PJV3's September read double its rent (owner,
// 10/2026). A fund shell has no tenants, so a shell carrying RENT in a month
// (`4230-*`) is the roll-up for that month, and the month is the shell's
// figures alone. Judged month by month, so a cash-only shell for Jan–Aug and a
// consolidated September upload each combine correctly.
//
// Pure (no storage) — the one rule behind every fund consolidation: the
// statement page, its downloads, reprojections, the T-12, the balance sheet,
// the budget draft and the line-detail drill-down.

import type { StoredGl } from "./statementStore";
import type { GlTransaction } from "./glParser";
import { FUND_BUILDINGS } from "@/lib/financials/cash-analysis/funds";

const isRent = (acct: string) => acct.startsWith("4230");

/** Months (index 0–11) in which the shell's GL is the buildings' roll-up. */
export function rollupMonths(shell: Pick<StoredGl, "monthly"> | null | undefined): boolean[] {
  const out = new Array(12).fill(false);
  if (!shell) return out;
  for (const [acct, nets] of Object.entries(shell.monthly)) {
    if (!isRent(acct)) continue;
    for (let i = 0; i < 12; i++) if (Math.abs(nets[i] ?? 0) >= 1) out[i] = true;
  }
  return out;
}

/** Account-level sum of the shell and its members, taking the shell ALONE in
 *  a month it is the roll-up. Beginning balances follow the shell's first
 *  covered month (a roll-up's opening already includes the buildings'). */
export function combineFundGls(shell: StoredGl | null, members: StoredGl[]): StoredGl | null {
  const parts = [shell, ...members].filter((g): g is StoredGl => !!g);
  if (!parts.length) return null;
  const rollup = rollupMonths(shell);
  const anyRollup = rollup.some(Boolean);
  const monthly: Record<string, number[]> = {};
  const beginning: Record<string, number> = {};
  const ytdTotal: Record<string, number> = {};
  const names: Record<string, string> = {};
  let maxPeriodInFile = 0, coverageEnd = 0;
  let coverageStartMonth: number | undefined;
  const shellFirst = shell ? Math.max(1, shell.coverageStartMonth ?? 1) - 1 : -1;
  const openingFromShellOnly = !!shell && rollup[shellFirst];
  for (const g of parts) {
    const isShell = g === shell;
    for (const [a, nets] of Object.entries(g.monthly)) {
      const arr = (monthly[a] ??= new Array(12).fill(0));
      for (let i = 0; i < 12; i++) if (isShell || !rollup[i]) arr[i] += nets[i] ?? 0;
    }
    if (g.beginning && (isShell || !openingFromShellOnly)) for (const [a, v] of Object.entries(g.beginning)) beginning[a] = (beginning[a] ?? 0) + v;
    if (g.ytdTotal && (isShell || !anyRollup)) for (const [a, v] of Object.entries(g.ytdTotal)) ytdTotal[a] = (ytdTotal[a] ?? 0) + v;
    if (g.names) for (const [a, n] of Object.entries(g.names)) if (n && !names[a]) names[a] = n;
    maxPeriodInFile = Math.max(maxPeriodInFile, g.maxPeriodInFile || 0);
    coverageEnd = Math.max(coverageEnd, g.coverageEnd ?? g.maxPeriodInFile ?? 0);
    if (g.coverageStartMonth != null) coverageStartMonth = Math.min(coverageStartMonth ?? 12, g.coverageStartMonth);
  }
  return { ...parts[parts.length - 1], monthly, beginning, ytdTotal, names, maxPeriodInFile, coverageEnd, coverageStartMonth };
}

/** A member's transactions with the shell's roll-up months taken out — those
 *  months' detail is already in the shell's own transactions. */
export function memberTransactionsOutsideRollup(
  txs: Record<string, GlTransaction[]>,
  rollup: boolean[],
): Record<string, GlTransaction[]> {
  if (!rollup.some(Boolean)) return txs;
  const out: Record<string, GlTransaction[]> = {};
  for (const [acct, list] of Object.entries(txs)) {
    const kept = list.filter((t) => !rollup[(t.month ?? 0) - 1]);
    if (kept.length) out[acct] = kept;
  }
  return out;
}

/** The fund shell's OWN figures — what it adds on top of its buildings — for
 *  anything that sums every statement key side by side (the portfolio NOI,
 *  the assistant's roll-up, Flags to Investigate). In a cash-only month that
 *  is the shell as uploaded; in a roll-up month it is the roll-up LESS the
 *  buildings, so a portfolio sum of buildings + shell counts each building
 *  once whichever way the fund was exported. */
export function shellOwnGl(shell: StoredGl, members: StoredGl[]): StoredGl {
  const rollup = rollupMonths(shell);
  if (!rollup.some(Boolean)) return shell;
  const monthly: Record<string, number[]> = {};
  for (const [a, nets] of Object.entries(shell.monthly)) monthly[a] = [...nets];
  for (const g of members) {
    for (const [a, nets] of Object.entries(g.monthly)) {
      const arr = (monthly[a] ??= new Array(12).fill(0));
      for (let i = 0; i < 12; i++) if (rollup[i]) arr[i] -= nets[i] ?? 0;
    }
  }
  for (const arr of Object.values(monthly)) for (let i = 0; i < 12; i++) if (Math.abs(arr[i]) < 0.005) arr[i] = 0;
  return { ...shell, monthly };
}

/** A statement key's GL for a SIDE-BY-SIDE sum over every key: a fund shell
 *  reads its own figures only (`shellOwnGl`), every other key as assembled. */
export function ownGlFor(key: string, assemble: (k: string) => StoredGl | null): StoredGl | null {
  const members = FUND_BUILDINGS[key] ?? FUND_BUILDINGS[key.toUpperCase()];
  const g = assemble(key);
  if (!g || !members) return g;
  return shellOwnGl(g, members.map(assemble).filter((x): x is StoredGl => !!x));
}
