// Pure assembler for a Statement-of-Values document's rows + totals, shared by
// the client page and the server-side send route so an emailed PDF is identical
// to the on-screen / downloaded one. No "server-only" — it's testable and takes
// the store overlays as plain args.

import { ENTITY_VALUES, entityValue } from "./entityValues";
import { statementForBeneficiary } from "./beneficiaries";
import type { StatementPdfRow } from "./statementPdf";

/** Just the entity fields an override may change that affect a statement. */
export type EntityOverlay = Record<string, { name?: string; equityValue?: number | null }>;
/** Estimate overlay: entity code → estimated equity. */
export type EstimateOverlay = { values: Record<string, number> };

/** The (possibly overridden) year-end equity for an entity. */
export function resolvedEquity(code: string, entOv: EntityOverlay): number {
  const ov = entOv[code];
  if (ov && ov.equityValue != null && Number.isFinite(ov.equityValue)) return ov.equityValue;
  return entityValue(code)?.equityValue ?? 0;
}

/** The (possibly overridden) display name for an entity. */
export function resolvedName(code: string, entOv: EntityOverlay): string {
  return entOv[code]?.name || entityValue(code)?.name || code;
}

/** The effective "today" estimate for an entity: the estimate override, else the
 *  (possibly overridden) year-end equity. */
export function resolvedEstimate(code: string, entOv: EntityOverlay, est: EstimateOverlay): number {
  const v = est.values[code];
  if (v != null && Number.isFinite(v)) return v;
  return resolvedEquity(code, entOv);
}

export interface StatementData {
  rows: StatementPdfRow[];
  totals: { yearEnd: number; estimated: number };
}

/** Rows + totals for one owner's statement (year-end + estimated columns). */
export function ownerStatementData(name: string, entOv: EntityOverlay, est: EstimateOverlay): StatementData {
  const lines = statementForBeneficiary(name);
  const rows: StatementPdfRow[] = lines.map((l) => ({
    code: entityValue(l.entity)?.propertyCode ?? l.entity,
    name: resolvedName(l.entity, entOv),
    pct: l.pct,
    yearEnd: l.pct * resolvedEquity(l.entity, entOv),
    estimated: l.pct * resolvedEstimate(l.entity, entOv, est),
  }));
  return {
    rows,
    totals: {
      yearEnd: rows.reduce((s, r) => s + (r.yearEnd ?? 0), 0),
      estimated: rows.reduce((s, r) => s + (r.estimated ?? 0), 0),
    },
  };
}

/** Rows + totals for the whole-portfolio statement. */
export function portfolioStatementData(entOv: EntityOverlay, est: EstimateOverlay): StatementData {
  const src = ENTITY_VALUES.map((e) => e.entity).sort(
    (a, b) => resolvedEquity(b, entOv) - resolvedEquity(a, entOv),
  );
  const rows: StatementPdfRow[] = src.map((code) => {
    const seed = entityValue(code)!;
    return { code: seed.propertyCode ?? code, name: resolvedName(code, entOv), yearEnd: resolvedEquity(code, entOv), estimated: resolvedEstimate(code, entOv, est) };
  });
  return {
    rows,
    totals: {
      yearEnd: rows.reduce((s, r) => s + (r.yearEnd ?? 0), 0),
      estimated: rows.reduce((s, r) => s + (r.estimated ?? 0), 0),
    },
  };
}
