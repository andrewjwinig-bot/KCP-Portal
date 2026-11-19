// A month's U&O, assembled (server). Nothing is keyed:
//
//   assessed values  the City's, per OPA parcel (assessedTaxes.ts — the budget's
//                    real-estate-tax source; 2026 = `prior`, 2027 = `assessed`),
//                    unless a value the City's form shows was typed on the page
//   tenancy          the rent roll AS OF the month (`rollAsOf`)
//   exemptions       the name rules + seeds + what was set on the page
//   delinquents      PROPOSED from the open items — the Aging Report
//                    (Detailed) where it is newer, else the laser statement —
//                    every tenant with an open U&O charge for the month or
//                    earlier; confirmed by Greg / Harry / Nancy
//   billed           each tenant's U&O line on their statement, checked
//                    against their computed share
//
// A property already FILED for the month reads its frozen figures.

import "server-only";
import { listJSON } from "@/lib/storage";
import { rollAsOf } from "@/lib/rentroll/current";
import { allRuns } from "@/lib/statements/store";
import { currentAging } from "@/lib/statements/agingStore";
import { agingLookup, statementFromAging } from "@/lib/statements/aging";
import { laserDate } from "@/lib/statements/currentAccount";
import type { TenantStatement } from "@/lib/statements/types";
import { statementBillingFor } from "@/lib/financials/budgets/statementBilling";
import { resolveAssessed, type AssessedValue, type CityValues } from "./assessments";
import { getCityAssessments } from "./assessmentsLoad";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { SEEDED_EXEMPT, UO_PROPERTIES, suggestedExemption, type UoAccount } from "./config";
import { computeReturn, sumLines, type UoLines, type UoReturn, type UoUnitIn } from "./compute";
import { emptyMonth, getUoMonth, getUoSettings, type UoFiled, type UoMonth, type UoSettings } from "./store";

export type UoCandidate = {
  unitRef: string;
  tenant: string;
  property: string;
  /** Open U&O on the statement, dated the month or before. */
  openUo: number;
  oldest: string | null;
  /** Reported delinquent the month before. */
  lastMonth: boolean;
  /** Where the open U&O was read: the Aging Report or the laser statement. */
  source: "aging" | "statement";
  asOf: string | null;
};

export type UoBilledCheck = { unitRef: string; tenant: string; share: number; billed: number | null; billedMonth?: string };

export type UoPropertyView = {
  code: string;
  name: string;
  returns: (UoReturn & { assessedSource: string })[];
  lines: UoLines;
  filed: UoFiled | null;
  discount: boolean;
  /** Taxable tenants' U&O charge on their statement vs their share. */
  billed: UoBilledCheck[];
  warnings: string[];
  /** No rent roll covers the property for the month: the split is unknown,
   *  so nothing is claimed due (and the JE leaves it out) until one does. */
  noTenancy: boolean;
};

export type UoMonthView = {
  month: string;
  record: UoMonth;
  settings: UoSettings;
  properties: UoPropertyView[];
  candidates: UoCandidate[];
  rollMonth: string | null;
  statementPeriod: string | null;
  statementAsOf: string | null;
  /** The Aging Report (Detailed) date, where it was the newer source. */
  agingAsOf: string | null;
  /** When the City's open data was last read, and any failure. */
  cityCheckedAt: string | null;
  cityError: string | null;
};

const prevMonth = (m: string) => {
  const y = Number(m.slice(0, 4)), n = Number(m.slice(5, 7));
  return n === 1 ? `${y - 1}-12` : `${y}-${String(n - 1).padStart(2, "0")}`;
};

/** The assessed value for a parcel in a calendar year — typed, then the
 *  budget's, then the City's open data (read weekly), then the latest year
 *  known (assessments.ts). */
export function assessedFor(parcel: string, year: number, settings: UoSettings, city: CityValues = {}): AssessedValue | null {
  return resolveAssessed(parcel, year, settings.assessed, city);
}

export function exemptionsOf(units: UoUnitIn[], settings: UoSettings): Map<string, string> {
  const out = new Map<string, string>();
  const off = new Set(settings.notExempt.map((s) => s.toUpperCase()));
  for (const u of units) {
    const ref = u.unitRef.toUpperCase();
    if (off.has(ref)) continue;
    const why = settings.exempt[ref] ?? SEEDED_EXEMPT[ref] ?? (u.vacant ? null : suggestedExemption(u.tenant));
    if (why) out.set(ref, why);
  }
  return out;
}

export async function loadUoMonth(month: string): Promise<UoMonthView> {
  const [record, settings, snapshots, runs, city] = await Promise.all([
    getUoMonth(month).then((m) => m ?? emptyMonth(month)),
    getUoSettings(),
    listJSON("rentroll-history", { fresh: true }).catch(() => []),
    allRuns().catch(() => []),
    getCityAssessments().catch(() => null),
  ]);
  const prior = await getUoMonth(prevMonth(month)).catch(() => null);
  const roll = rollAsOf(snapshots as { properties?: any[] }[], month) as { properties?: any[]; reportTo?: string } | null;
  const year = Number(month.slice(0, 4));
  const delinquent = new Set(record.delinquents.map((s) => s.toUpperCase()));

  // Which tenants still owe U&O: the open items on the NEWEST data — the
  // Aging Report (Detailed) where it is at least as new as the laser
  // statement (the report the team circulated for U&O review around the
  // 16th, which lists every open charge with its code and date), else the
  // laser statement. Per tenant, as `statementOf` reads an account, so a
  // credits-only aging run never hides a tenant who owes.
  const run = runs.find((r) => r.period <= month) ?? runs[0] ?? null;
  const aging = await currentAging().catch(() => null);
  const monthEnd = `${month}-31`;
  const lastMonth = new Set((prior?.delinquents ?? []).map((s) => s.toUpperCase()));
  const codes = new Set(UO_PROPERTIES.map((p) => p.code));
  const accounts = new Map<string, { st: TenantStatement; source: "aging" | "statement"; asOf: string | null }>();
  for (const laser of run?.statements ?? []) {
    if (!codes.has(String(laser.propertyCode).toUpperCase()) || laser.noOpenItems) continue;
    const hit = aging ? agingLookup(aging, laser.unitRef, laser.tenantName) : null;
    if (hit?.kind === "found" && hit.tenant.asOf >= laserDate(laser, run?.updatedAt)) {
      accounts.set(laser.unitRef.toUpperCase(), { st: statementFromAging(hit.tenant, laser), source: "aging", asOf: hit.tenant.asOf });
    } else {
      accounts.set(laser.unitRef.toUpperCase(), { st: laser, source: "statement", asOf: laserDate(laser, run?.updatedAt) || null });
    }
  }
  // A tenant on the aging report but not on that laser statement.
  for (const t of aging?.tenants ?? []) {
    const ref = t.unitRef.toUpperCase();
    if (!codes.has(String(t.propertyCode).toUpperCase()) || accounts.has(ref)) continue;
    accounts.set(ref, { st: statementFromAging(t, null), source: "aging", asOf: t.asOf });
  }
  const candidates: UoCandidate[] = [];
  for (const { st, source, asOf } of accounts.values()) {
    const uo = (st.charges ?? []).filter((c) => c.category === "uando" && c.amount > 0 && (!c.dateISO || c.dateISO <= monthEnd));
    const open = Math.round(uo.reduce((s, c) => s + c.amount, 0) * 100) / 100;
    if (open <= 0) continue;
    const dates = uo.map((c) => c.dateISO).filter(Boolean).sort() as string[];
    candidates.push({ unitRef: st.unitRef, tenant: st.tenantName, property: st.propertyCode, openUo: open, oldest: dates[0] ?? null, lastMonth: lastMonth.has(st.unitRef.toUpperCase()), source, asOf });
  }
  const sources = [...accounts.values()];
  const agingUsed = sources.filter((a) => a.source === "aging").map((a) => a.asOf ?? "").sort().pop() || null;
  const laserUsed = sources.some((a) => a.source === "statement") ? (laserDate(run?.statements?.[0] ?? null, run?.updatedAt) || null) : null;

  const properties: UoPropertyView[] = [];
  for (const cfg of UO_PROPERTIES) {
    const def = PROPERTY_DEFS.find((d) => d.id === cfg.code);
    const rp = (roll?.properties ?? []).find((p: any) => String(p?.propertyCode ?? "").toUpperCase() === cfg.code);
    const units: UoUnitIn[] = (rp?.units ?? []).map((u: any) => ({
      unitRef: String(u.unitRef), tenant: String(u.occupantName ?? ""), sqft: Number(u.sqft) || 0,
      vacant: !!u.isVacant || /^vacant\b/i.test(String(u.occupantName ?? "")), amenity: !!u.amenity,
    }));
    const exempt = exemptionsOf(units, settings);
    const discount = !(record.skipDiscount ?? []).includes(cfg.code);
    const warnings: string[] = [];
    if (!rp) warnings.push("No rent roll covers this property for the month — import one before filing.");
    const returns = cfg.accounts.map((account: UoAccount) => {
      const a = assessedFor(account.parcel, year, settings, city?.values ?? {});
      const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
      if (!a) warnings.push(`No assessed value on file for parcel ${account.parcel}.`);
      else if (a.stale) warnings.push(`${account.label}: the City has not certified a ${year} value yet, so Line 1 uses ${a.fromYear}'s (${usd(a.value)}). Check Line A on the City's form and type it if it differs.`);
      else if (a.cityDiffers != null) warnings.push(`${account.label}: the City's open data now reads ${usd(a.cityDiffers)} for ${year}; the return uses ${usd(a.value)}. Check Line A on the City's form and type it if it differs.`);
      const r = computeReturn({ account, assessed: a?.value ?? 0, units: account.noTenants ? [] : units, commonAreas: account.noTenants ? [] : cfg.commonAreas, exempt, delinquent, discount });
      return { ...r, assessedSource: a?.source ?? "Unknown" };
    });

    // Billed vs owed: the taxable tenants' U&O line on their newest statement.
    const billing = await statementBillingFor(cfg.code).catch(() => new Map());
    const billed: UoBilledCheck[] = returns.flatMap((r) => r.rows)
      .filter((row) => row.unitRef && (row.status === "taxable" || row.status === "delinquent"))
      .map((row) => {
        const b = billing.get(row.unitRef!.toUpperCase());
        return { unitRef: row.unitRef!, tenant: row.tenant, share: row.share, billed: b?.uo ?? null, billedMonth: b?.month };
      });
    // A basis check: what the tenants are billed implies the SF the City's
    // allocation is spread over. A clear gap means space is missing from (or
    // extra on) the roll's basis — common area, a pad site.
    const implied = billed.filter((b) => b.billed && b.billed > 50).map((b) => {
      const row = returns[0].rows.find((x) => x.unitRef === b.unitRef)!;
      return (returns[0].lines.maxTax * row.sqft) / b.billed!;
    }).sort((x, y) => x - y);
    if (implied.length >= 3 && returns[0].basisSf > 0) {
      const med = implied[Math.floor(implied.length / 2)];
      if (Math.abs(med - returns[0].basisSf) / returns[0].basisSf > 0.015) {
        warnings.push(`Tenants' U&O charges imply the tax is spread over about ${Math.round(med).toLocaleString("en-US")} SF; the rent roll${cfg.commonAreas?.length ? " and common area" : ""} gives ${returns[0].basisSf.toLocaleString("en-US")} SF. Either the charges are on an old assessment or space is missing from the basis.`);
      }
    }

    properties.push({
      code: cfg.code, name: def?.name ?? cfg.code, returns, lines: sumLines(returns),
      filed: record.filed[cfg.code] ?? null, discount, billed, warnings,
      noTenancy: !rp && cfg.accounts.some((a) => !a.noTenants),
    });
  }

  return {
    month, record, settings, properties, candidates,
    rollMonth: roll?.reportTo ? String(roll.reportTo).slice(0, 7) : null,
    statementPeriod: run?.period ?? null,
    statementAsOf: laserUsed,
    agingAsOf: agingUsed,
    cityCheckedAt: city?.checkedAt ?? null,
    cityError: city?.error ?? null,
  };
}
