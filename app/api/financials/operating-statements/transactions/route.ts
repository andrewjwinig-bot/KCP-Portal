import { NextResponse } from "next/server";
import { latestGl, getGl, getTransactions } from "@/lib/financials/operating-statements/statementStore";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import { buildTenantLookup } from "@/lib/financials/operating-statements/tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET — the transactions behind a statement line. Filter the stored GL
// transactions to the accounts matching the line's mask, within the period
// (scope=month) or year-to-date (scope=ytd). `sign` aligns the amounts to the
// line's orientation (revenue lines pass sign=-1 so credits read positive and
// the total ties to the line's actual).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const year = Number(url.searchParams.get("year"));
  const mask = url.searchParams.get("mask");
  const period = Number(url.searchParams.get("period")) || 12;
  const scope = url.searchParams.get("scope") === "month" ? "month" : "ytd";
  const sign = url.searchParams.get("sign") === "-1" ? -1 : 1;
  const versionId = url.searchParams.get("version");

  if (!key || !year || !mask) {
    return NextResponse.json({ error: "key, year and mask are required" }, { status: 400 });
  }

  const stored = versionId ? await getGl(versionId) : await latestGl(key, year);
  if (!stored) return NextResponse.json({ transactions: [], total: 0, count: 0 });

  const byAccount = await getTransactions(stored.id);
  const accounts = Object.keys(byAccount).filter((a) => accountMatchesMask(mask, a));
  const tenantFor = await buildTenantLookup();

  // Tenant/payer for a transaction. Two chart patterns are supported:
  //  A) per-unit accounts — the account itself maps to a rent-roll tenant;
  //  B) one revenue account, the tenant carried on each charge — use the
  //     transaction's vendor (parsed out of the merged description for GLs
  //     imported before vendor was stored separately).
  const vendorOf = (t: { vendor?: string; description: string }): string =>
    (t.vendor && t.vendor.trim()) || (t.description || "").split(" — ")[0].trim();

  const rows: { account: string; tenant: string | null; groupKey: string; date: string | null; description: string; ref: string; amount: number; month: number }[] = [];
  for (const account of accounts) {
    const acctTenant = tenantFor(account);
    for (const t of byAccount[account]) {
      if (scope === "month" ? t.month !== period : t.month > period) continue;
      const payer = vendorOf(t);
      const tenant = acctTenant ?? (payer || null);
      // Group by the account when it identifies the tenant, else by the payer.
      const groupKey = acctTenant ? `A:${account}` : `P:${payer || account}`;
      rows.push({ account, tenant, groupKey, date: t.date, description: t.description, ref: t.ref, amount: t.amount * sign, month: t.month });
    }
  }
  rows.sort((a, b) => (a.date && b.date ? (a.date < b.date ? 1 : -1) : b.month - a.month));
  const total = rows.reduce((s, r) => s + r.amount, 0);

  // Per-tenant breakdown so the drill-down can list each tenant and isolate the
  // ones driving the line. Sorted by magnitude.
  const groups = new Map<string, { groupKey: string; account: string; tenant: string | null; amount: number; count: number }>();
  for (const r of rows) {
    const g = groups.get(r.groupKey) ?? { groupKey: r.groupKey, account: r.account, tenant: r.tenant, amount: 0, count: 0 };
    g.amount += r.amount; g.count += 1;
    groups.set(r.groupKey, g);
  }
  const byTenant = [...groups.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return NextResponse.json({ transactions: rows, total, count: rows.length, accounts, byTenant });
}
