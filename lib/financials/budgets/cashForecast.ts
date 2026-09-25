// The bottom of the budget: DISTRIBUTIONS and the PROJECTED BANK BALANCE.
//
// Cash flow after debt service says what the property earns; the owner's
// question is what is left in the bank once the partners are paid. So the draft
// carries two more rows below it:
//
//   Distributions          — the plan, typed by month (seeded from the owner's
//                            anticipated distributions, below)
//   Projected bank balance — the cash on the GL today, rolled forward through
//                            the rest of this year and then month by month
//                            through the budget: + cash flow − distributions.
//
// The opening is the GL's own cash (every cash account at its last posted
// month, security deposits excluded — that money is owed back to tenants), and
// the months of THIS year not yet posted are rolled forward on the
// reprojection's cash flow so the budget opens where this year should close.
//
// Pure — the draft passes the GL in — so it is tested directly.

import { isCashAccount } from "@/lib/financials/cashAccounts";

const r0 = (n: number) => Math.round(n);

/** The owner's anticipated ANNUAL distributions by property, paid
 *  semiannually in April and October. The starting figure only: a typed month
 *  replaces it (Cash::Distributions in the typed-month store). */
export const DISTRIBUTION_PLAN: Record<string, number> = {
  "4500": 500_000, // Gray's Ferry Shopping Center
  "7300": 300_000, // Revere Partnership
  "7010": 200_000, // Parkwood Shopping/Office Center
  "8200": 200_000, // Trust #4
};
/** April and October. */
export const DISTRIBUTION_MONTHS = [3, 9];

export const DISTRIBUTIONS_SECTION = "Cash";
export const DISTRIBUTIONS_LABEL = "Distributions";
export const OPENING_LABEL = "Opening Balance";

/** A property's planned distributions, month by month, in whole dollars. */
export function plannedDistributions(code: string): number[] {
  const out = new Array(12).fill(0);
  const annual = DISTRIBUTION_PLAN[String(code).toUpperCase()] ?? 0;
  if (!annual) return out;
  const each = r0(annual / DISTRIBUTION_MONTHS.length);
  DISTRIBUTION_MONTHS.forEach((m, i) => { out[m] = i === DISTRIBUTION_MONTHS.length - 1 ? annual - each * i : each; });
  return out;
}

type Gl = {
  beginning?: Record<string, number>;
  monthly: Record<string, number[]>;
  names?: Record<string, string>;
  maxPeriodInFile?: number;
};

/** An operating cash account — cash and money market, NOT the security
 *  deposit account (restricted: it is the tenants' money). */
export function isOperatingCash(code: string, name: string): boolean {
  return isCashAccount(code, name) && !/security\s*dep/i.test(name);
}

/** The cash on the GL at its last posted month: each operating cash account's
 *  opening plus its nets through that month. Null without opening balances —
 *  the nets alone are the year's cash FLOW, not a balance. */
export function cashOnGl(gl: Gl | null | undefined): { balance: number; month: number; accounts: { code: string; name: string; balance: number }[] } | null {
  if (!gl?.beginning || !Object.keys(gl.beginning).length) return null;
  const month = Math.max(0, Math.min(12, gl.maxPeriodInFile ?? 0));
  const codes = new Set([...Object.keys(gl.beginning), ...Object.keys(gl.monthly ?? {})]);
  const accounts: { code: string; name: string; balance: number }[] = [];
  for (const code of codes) {
    const name = gl.names?.[code] ?? "";
    if (!isOperatingCash(code, name)) continue;
    let b = gl.beginning[code] ?? 0;
    const nets = gl.monthly?.[code] ?? [];
    for (let i = 0; i < month; i++) b += nets[i] || 0;
    if (Math.abs(b) >= 0.5) accounts.push({ code, name, balance: r0(b) });
  }
  accounts.sort((a, b) => a.code.localeCompare(b.code));
  return { balance: accounts.reduce((a, x) => a + x.balance, 0), month, accounts };
}

/** What the GL shows distributed this year, month by month — the partners'
 *  distribution accounts (balance-sheet range, named "distribution"), as a
 *  positive outflow. The reference beside the budget's row. */
export function distributionsOnGl(gl: Gl | null | undefined): number[] {
  const out = new Array(12).fill(0);
  if (!gl) return out;
  for (const [code, nets] of Object.entries(gl.monthly ?? {})) {
    const n = Number(code.slice(0, 4));
    if (!(n < 4000) || !/distribut/i.test(gl.names?.[code] ?? "")) continue;
    for (let i = 0; i < 12; i++) out[i] += nets[i] || 0;
  }
  return out.map(r0);
}

/** The bank balance at the end of each month: the opening, plus each month's
 *  cash flow, less its distributions. */
export function projectBalance(opening: number, cashFlow: number[], distributions: number[]): number[] {
  let b = opening;
  return cashFlow.map((cf, i) => (b = r0(b + (cf || 0) - (distributions[i] || 0))));
}

/** Rolls the GL's cash forward from its last posted month to the end of the
 *  year on the reprojection's cash flow for the months still to come, less any
 *  distributions planned in them. */
export function rollForward(balance: number, fromMonth: number, cashFlow: number[], distributions: number[]): number {
  let b = balance;
  for (let i = fromMonth; i < 12; i++) b += (cashFlow[i] || 0) - (distributions[i] || 0);
  return r0(b);
}

export type DraftCash = {
  /** The GL's cash and the month it is through (1–12), when the GL has openings. */
  gl: { balance: number; year: number; month: number; accounts: { code: string; name: string; balance: number }[] } | null;
  /** Rolled to Dec 31 of the basis year on the reprojection's cash flow. */
  projectedYearEnd: number | null;
  /** The balance the budget opens on: typed, else the rolled-forward GL. */
  opening: number;
  openingTyped: boolean;
  distributions: { months: number[]; total: number; typed?: boolean[]; source: "plan" | "entered" | "none"; basisYearActual: number[] };
  /** End-of-month balance through the budget year. */
  balance: number[];
  /** A book's roll-up: each property's part. */
  byProperty?: { code: string; name: string; opening: number; distributions: number; yearEnd: number }[];
};
