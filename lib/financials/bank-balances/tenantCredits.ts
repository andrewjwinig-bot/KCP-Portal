// TENANT CREDITS HELD IN RESERVE (owner, 11/2026: "take the net open credits as
// reserves on the bank balances … net credits only … in reserves and on a hover
// show breakdown between credits and capex items … keep bank balances simple").
//
// A tenant whose account nets to a CREDIT has prepaid or overpaid us — it comes
// off their next rent or goes back as a refund, so it is not cash to
// distribute. Only the NET is held: a tenant's credit beyond their own open
// charges. A tenant who owes us on balance adds nothing (unpaid A/R is never
// counted as cash either). Former tenants (-FO) count in full — a refund owed.
// Under $5 is left off, as Open Credits does. Pure.

import { MIN_OPEN_CREDIT } from "@/lib/statements/aging";

export type CreditTenantIn = { unitRef: string; tenantName: string; propertyCode: string; balanceDue: number; asOf: string };
export type HeldCredit = { unitRef: string; tenantName: string; credit: number };
export type LineCredits = { total: number; asOf: string | null; tenants: HeldCredit[] };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Net credits by property code (uppercased). */
export function netCreditsByProperty(tenants: CreditTenantIn[]): Map<string, LineCredits> {
  const out = new Map<string, LineCredits>();
  for (const t of tenants) {
    const credit = r2(-t.balanceDue);
    if (!(credit >= MIN_OPEN_CREDIT)) continue;
    const code = String(t.propertyCode ?? "").toUpperCase();
    const cur = out.get(code) ?? { total: 0, asOf: null, tenants: [] };
    cur.total = r2(cur.total + credit);
    cur.tenants.push({ unitRef: t.unitRef, tenantName: t.tenantName, credit });
    if (t.asOf && (!cur.asOf || t.asOf > cur.asOf)) cur.asOf = t.asOf;
    out.set(code, cur);
  }
  return out;
}

/** A bank line's credits: every property it carries (a fund's buildings). */
export function creditsForLine(byCode: Map<string, LineCredits>, codes: string[]): LineCredits {
  const out: LineCredits = { total: 0, asOf: null, tenants: [] };
  for (const c of new Set(codes.map((x) => x.toUpperCase()))) {
    const hit = byCode.get(c);
    if (!hit) continue;
    out.total = r2(out.total + hit.total);
    out.tenants.push(...hit.tenants);
    if (hit.asOf && (!out.asOf || hit.asOf > out.asOf)) out.asOf = hit.asOf;
  }
  out.tenants.sort((a, b) => b.credit - a.credit);
  return out;
}
