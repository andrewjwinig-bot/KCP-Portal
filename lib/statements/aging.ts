// The Aging Report as the portal reads it — pure, client-safe. See
// `parseAgingReport.ts` for the file and `agingStore.ts` for storage.
//
// It is the CURRENT truth of a tenant's open items: the laser statement is
// run once a month, the aging report whenever Tami runs it, and it itemizes
// each credit (what it is, its date) where the laser statement prints only an
// "Open Credits" total. So wherever it is newer it is what Receipt
// Reconciliation and the Open Credits page read (`statementFromAging`).

import type { AgingLine, AgingTenant } from "./parseAgingReport";
import type { StatementCharge, TenantStatement } from "./types";

/** One import, kept per as-of date. Importing the same day again merges by
 *  property — a run for one building does not erase the rest. */
export type AgingSnapshot = {
  asOf: string;               // YYYY-MM-DD, the report's "as of"
  runAt: string | null;       // when Skyline ran it
  importedAt: string;
  importedBy: string | null;
  sourceFile: string;
  propertyCodes: string[];
  tenants: (AgingTenant & { unitRef: string; propertyCode: string })[];
};

export type CurrentAgingTenant = AgingTenant & { unitRef: string; propertyCode: string; asOf: string; runAt: string | null };
export type CurrentAging = {
  tenants: CurrentAgingTenant[];
  /** property code → the as-of date its figures come from. */
  coverage: Record<string, string>;
};

/** Each property from the NEWEST snapshot carrying it, optionally no later
 *  than `onOrBefore` (to re-derive a receipt against the figures it was sent on). */
export function composeAging(snaps: AgingSnapshot[], onOrBefore?: string): CurrentAging {
  const eligible = snaps.filter((s) => s && (!onOrBefore || s.asOf <= onOrBefore))
    .sort((a, b) => (b.asOf.localeCompare(a.asOf)) || b.importedAt.localeCompare(a.importedAt));
  const coverage: Record<string, string> = {};
  const tenants: CurrentAgingTenant[] = [];
  for (const s of eligible) {
    for (const code of s.propertyCodes) {
      if (coverage[code]) continue;
      coverage[code] = s.asOf;
      for (const t of s.tenants) if (t.propertyCode === code) tenants.push({ ...t, asOf: s.asOf, runAt: s.runAt });
    }
  }
  return { tenants, coverage };
}

export type AgingLookup =
  | { kind: "found"; tenant: CurrentAgingTenant }
  /** The report covers the property and the tenant is not on it. It is run
   *  for "Any With Open Credits", so this means NO CREDIT — not no open
   *  items; the laser statement still holds their charges. */
  | { kind: "clear"; asOf: string }
  | { kind: "none" };

export function agingLookup(cur: CurrentAging, unitRef: string, tenantName?: string): AgingLookup {
  const ref = unitRef.trim().toUpperCase();
  const matches = cur.tenants.filter((t) => t.unitRef.toUpperCase() === ref);
  // Two occupants of one suite (a former and a current one) — the name decides.
  const fold = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const hit = matches.length > 1 && tenantName ? matches.find((t) => fold(t.tenantName).startsWith(fold(tenantName).slice(0, 8)) || fold(tenantName).startsWith(fold(t.tenantName).slice(0, 8))) ?? matches[0] : matches[0];
  if (hit) return { kind: "found", tenant: hit };
  const code = ref.split("-")[0];
  if (cur.coverage[code]) return { kind: "clear", asOf: cur.coverage[code] };
  return { kind: "none" };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const BUCKET_SHORT = ["1–30", "31–60", "61–90", "90+"];

/** A credit line's description as a tenant should read it — Skyline's
 *  description, else its code. */
export function lineLabel(l: Pick<AgingLine, "code" | "description">): string {
  return l.description || l.code;
}

/**
 * The tenant's account as a TenantStatement built from the aging lines, so
 * everything that reads a statement (the matching engine, the receipt email's
 * table, the attached PDF) reads the itemized credits. Identity (name, address)
 * comes from the laser statement when there is one.
 */
export function statementFromAging(t: CurrentAgingTenant, base?: TenantStatement | null): TenantStatement {
  const charges: StatementCharge[] = t.lines.map((l) => ({
    dateISO: l.dateISO, description: lineLabel(l), amount: l.amount, category: l.category, section: "prior",
    ...(reconYearOf(l.description) ? { reconYear: reconYearOf(l.description) } : {}),
  }));
  const total = r2(t.lines.reduce((a, l) => a + l.amount, 0));
  const suite = t.unitRef.split("-").slice(1).join("-");
  return {
    unitRef: t.unitRef,
    skylineUnitRef: base?.skylineUnitRef ?? `${t.unitRef}-CU`,
    propertyCode: t.propertyCode,
    suite: base?.suite ?? suite,
    tenantName: base?.tenantName ?? t.tenantName,
    address: base?.address ?? [],
    charges,
    reportedBalance: t.balanceDue,
    priorBalance: t.balanceDue,
    currentTotal: 0,
    chargeTotal: total,
    tiesOut: t.tiesOut,
    importedAt: base?.importedAt,
    sourceFile: "Aging Report",
    exportedAt: t.runAt ? new Date(t.runAt).toISOString() : `${t.asOf}T12:00:00.000Z`,
  };
}

function reconYearOf(desc: string): number | undefined {
  if (!/reconcil|year\s*end|adjustment/i.test(desc)) return undefined;
  const m = desc.match(/(20\d{2})/);
  return m ? Number(m[1]) : undefined;
}

/** Whole days a line has been open as of the report. */
export function daysOpen(dateISO: string | null, asOf: string): number | null {
  if (!dateISO) return null;
  return Math.max(0, Math.round((Date.parse(`${asOf}T12:00:00Z`) - Date.parse(`${dateISO}T12:00:00Z`)) / 86_400_000));
}

/** The tenant's credits, oldest first. */
export function creditLinesOf(t: Pick<AgingTenant, "lines">): AgingLine[] {
  return t.lines.filter((l) => l.amount < -0.005).sort((a, b) => (a.dateISO ?? "").localeCompare(b.dateISO ?? ""));
}
