import { NextResponse } from "next/server";
import { getGl, getTransactions, assembledTransactions } from "@/lib/financials/operating-statements/statementStore";
import { accountMatchesMask } from "@/lib/financials/operating-statements/mask";
import { buildTenantDirectory } from "@/lib/financials/operating-statements/tenants";

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

  // A specific version pick reads just that upload; the default view merges
  // every upload's transactions (matching the assembled statement) so the
  // drill-down has every month, not only the newest file's.
  const byAccount = versionId
    ? await (async () => { const v = await getGl(versionId); return v ? getTransactions(v.id) : {}; })()
    : await assembledTransactions(key, year);
  if (!Object.keys(byAccount).length) return NextResponse.json({ transactions: [], total: 0, count: 0 });
  const accounts = Object.keys(byAccount).filter((a) => accountMatchesMask(mask, a));
  const { tenantForAccount, unitForName, findUnit } = await buildTenantDirectory();

  // Tenant/payer for a transaction. Three chart patterns are supported:
  //  A) per-unit accounts — the account itself maps to a rent-roll tenant;
  //  B) one revenue account with the unit ref written into the charge's own
  //     text ("RNT to 9510-406") — the Skyline rent pattern. Read the unit out
  //     of the text and resolve it against the rent roll, so the row names the
  //     suite and its tenant instead of echoing the raw posting description;
  //  C) one account, a named payer on each charge — use the transaction's
  //     vendor (parsed out of the merged description for GLs imported before
  //     vendor was stored separately) and match it back to a unit by name.
  const vendorOf = (t: { vendor?: string; description: string }): string =>
    (t.vendor && t.vendor.trim()) || (t.description || "").split(" — ")[0].trim();

  const rows: { account: string; unit: string | null; tenant: string | null; groupKey: string; date: string | null; description: string; ref: string; amount: number; month: number }[] = [];
  for (const account of accounts) {
    const acctTenant = tenantForAccount(account);
    for (const t of byAccount[account]) {
      if (scope === "month" ? t.month !== period : t.month > period) continue;
      const payer = vendorOf(t);
      // Pattern B: the unit ref lives in the charge text. Checked before the
      // payer fallback, since that fallback is what was putting "RNT to
      // 9510-406" in the Tenant column with no suite at all.
      const hit = acctTenant ? null : (findUnit(t.description) ?? findUnit(t.vendor || ""));
      let unit: string | null;
      let tenant: string | null;
      let groupKey: string;
      if (acctTenant) {
        unit = account; tenant = acctTenant; groupKey = `A:${account}`;
      } else if (hit) {
        // A vacant/expired suite resolves its unit but has no occupant — say
        // the suite rather than falling back to the posting text.
        unit = hit.unitRef; tenant = hit.tenant; groupKey = `U:${hit.unitRef}`;
      } else {
        tenant = payer || null;
        unit = tenant ? unitForName(tenant) : null;
        groupKey = `P:${payer || account}`;
      }
      rows.push({ account, unit, tenant, groupKey, date: t.date, description: t.description, ref: t.ref, amount: t.amount * sign, month: t.month });
    }
  }
  rows.sort((a, b) => (a.date && b.date ? (a.date < b.date ? 1 : -1) : b.month - a.month));
  const total = rows.reduce((s, r) => s + r.amount, 0);

  // Per-tenant breakdown so the drill-down can list each tenant/suite and
  // isolate the ones driving the line. Sorted by magnitude.
  const groups = new Map<string, { groupKey: string; account: string; unit: string | null; tenant: string | null; amount: number; count: number }>();
  for (const r of rows) {
    const g = groups.get(r.groupKey) ?? { groupKey: r.groupKey, account: r.account, unit: r.unit, tenant: r.tenant, amount: 0, count: 0 };
    g.amount += r.amount; g.count += 1;
    groups.set(r.groupKey, g);
  }
  const byTenant = [...groups.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  return NextResponse.json({ transactions: rows, total, count: rows.length, accounts, byTenant });
}
