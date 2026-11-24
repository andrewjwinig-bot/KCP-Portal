// The portfolio cash forecast: every bank line rolled to Dec 31 on its
// reprojection (lib/financials/cash-forecast). Answers to the Bank Balances
// page (users.ts), and ALSO needs Reprojections — each line's cash flow is
// its NOI less debt, which a view-only Bank Balances grant does not open.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, isPathAllowed, type UserId } from "@/lib/users";
import { buildBalanceView } from "@/lib/financials/bank-balances/view";
import { monthlyStatements } from "@/lib/financials/operating-statements/mappingStore";
import { loadReprojection } from "@/lib/financials/reprojections/load";
import { assembledGlConsolidated } from "@/lib/financials/operating-statements/statementStore";
import { plannedDistributions, distributionsOnGl } from "@/lib/financials/budgets/cashForecast";
import { forecastLine, totalsOf, statementKeysFor, type ForecastLineInput } from "@/lib/financials/cash-forecast/forecast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

const add = (a: number[], b: number[]) => a.map((x, i) => x + (b[i] || 0));

/** Run `fn` over `items`, `n` at a time. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

export async function GET() {
  const user = await currentUser();
  if (user && !isPathAllowed(user, "/financials/reprojections")) {
    return NextResponse.json({ error: "The cash forecast reads every property's reprojection." }, { status: 403 });
  }
  try {
    const now = new Date();
    const year = now.getFullYear();
    const [view, statements] = await Promise.all([buildBalanceView(now), monthlyStatements()]);
    const keys = new Set(statements.map((s) => s.key));

    // One reprojection per statement, however many lines read it. A read that
    // fails is tried once more, then SAID — never passed off as a flat line.
    type Driver = { cashFlow: number[]; plan: number[]; paid: number[] } | { failed: string } | null;
    const cache = new Map<string, Promise<Driver>>();
    const readOnce = async (k: string): Promise<Driver> => {
      const [r, gl] = await Promise.all([loadReprojection(k, year), assembledGlConsolidated(k, year).catch(() => null)]);
      if (!r) return null;
      return {
        cashFlow: r.reprojection.rollups.cashFlowAfterDebtService.blended,
        plan: plannedDistributions(r.meta.propertyCode),
        paid: distributionsOnGl(gl as never),
      };
    };
    const driver = (k: string) => {
      if (!cache.has(k)) cache.set(k, readOnce(k).catch(() => readOnce(k)).catch((e) => {
        console.error(`[cash-forecast] ${k}:`, e);
        return { failed: k };
      }));
      return cache.get(k)!;
    };

    const inputs = await pool(view.rows, 4, async (row): Promise<ForecastLineInput> => {
      const asOf = row.accounts.map((a) => a.asOf).filter(Boolean).sort()[0] ?? null;
      const base = { key: row.key, name: row.name, group: row.group, balance: row.balance, asOf, restricted: row.restricted };
      if (row.restricted) return { ...base, cashFlow: null, flatReason: "Tenant money — not in the totals" };
      if (row.handsOff) return { ...base, cashFlow: null, flatReason: "Hands-off trust — held, not distributed" };
      const read = (await Promise.all(statementKeysFor(row.key, keys).map(driver))).filter(Boolean);
      const failed = read.filter((d) => d && "failed" in d);
      if (failed.length) return { ...base, cashFlow: null, flatReason: "Its reprojection could not be read — refresh to retry" };
      const drivers = read as { cashFlow: number[]; plan: number[]; paid: number[] }[];
      if (!drivers.length) return { ...base, cashFlow: null };
      const zero = new Array(12).fill(0);
      return {
        ...base,
        cashFlow: drivers.reduce((s, d) => add(s, d.cashFlow), zero),
        plan: drivers.reduce((s, d) => add(s, d.plan), zero),
        paidOnGl: drivers.reduce((s, d) => add(s, d.paid), zero),
      };
    });
    const lines = inputs.map((i) => forecastLine(i, year));
    return NextResponse.json({ year, groups: view.groups, lines, totals: totalsOf(lines) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
