// Trade receivables against Skyline's tenant aging (the accountants' A/R tab).
//
// The source is Skyline's Aging Report (Detailed) — the same report Open
// Credits imports as the "Credit Balance report", run instead for EVERY tenant
// with a balance and AS OF the quarter end. The Laser Statement cannot prove a
// quarter: it lists what is open on the day it is run, not at a date.
//
// Pure: the store and the route read and write; this sums and explains.

import type { AgingTenant } from "@/lib/statements/parseAgingReport";

export type ArTenant = { unitRef: string; tenantName: string; balance: number; former: boolean };
export type ArSection = { code: string; total: number; charges: number; credits: number; tenants: ArTenant[] };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** One property's tenants, as the workpaper reads them: what each owes (a
 *  credit is negative), the property's net, and its charges and credits apart. */
export function arSections(tenants: (AgingTenant & { unitRef: string; propertyCode: string })[]): Record<string, ArSection> {
  const out: Record<string, ArSection> = {};
  for (const t of tenants) {
    const s = (out[t.propertyCode] ??= { code: t.propertyCode, total: 0, charges: 0, credits: 0, tenants: [] });
    const charges = t.lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
    const credits = t.lines.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
    s.total = round2(s.total + t.balanceDue);
    s.charges = round2(s.charges + charges);
    s.credits = round2(s.credits + credits);
    s.tenants.push({ unitRef: t.unitRef, tenantName: t.tenantName, balance: round2(t.balanceDue), former: !!t.unitType && !/^CURR/i.test(t.unitType) });
  }
  for (const s of Object.values(out)) s.tenants.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  return out;
}

/** Tenants whose balance alone is the gap — a balance booked to another
 *  property or account, or one side of a write-off. Exact to the cent. */
export function tenantsMatchingGap(tenants: ArTenant[], gap: number): ArTenant[] {
  return tenants.filter((t) => Math.abs(Math.abs(t.balance) - Math.abs(gap)) < 0.01);
}
