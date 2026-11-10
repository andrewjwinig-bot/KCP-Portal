// A tenant's account as of the newest data the portal holds — the laser
// statement, or the Aging Report where that is at least as new (it itemizes
// each credit with its description and date). ONE reader for Receipt
// Reconciliation, the balance reminder and the Open Credits page, so the
// figures in every email agree.

import "server-only";
import { getRun } from "./store";
import { currentAging } from "./agingStore";
import { agingLookup, statementFromAging, type CurrentAging } from "./aging";
import type { TenantStatement } from "./types";
import type { ReceiptRec } from "./receiptStore";

export type DataDates = { dataThrough: string | null; importedOn: string | null; stampRead: boolean; source?: "aging" | "statement" };

/** Aging data is read when it is at least as new as the laser statement: it
 *  is the same open items, itemized — each credit with its description and
 *  date — and usually run more recently. */
export const laserDate = (st: TenantStatement | null, runUpdated?: string | null) => (st?.exportedAt ?? st?.importedAt ?? runUpdated ?? "").slice(0, 10);

/**
 * The tenant's account for the page, the send and every re-derivation. With
 * `aging` (a composed Aging Report) the newest itemized open items win;
 * `aging: false` reads the laser statement alone — how a receipt saved before
 * an aging import is re-derived on the figures it was sent on.
 */
export async function statementOf(period: string, unit: string, opts: { aging?: CurrentAging | false } = {}): Promise<{ st: TenantStatement; asOf: string | null; dates: DataDates; agingAsOf: string | null } | null> {
  const run = await getRun(period);
  const laser = run?.statements.find((s) => s.unitRef.toUpperCase() === unit.toUpperCase()) ?? null;
  const aging = opts.aging === false ? null : opts.aging ?? await currentAging();
  if (aging) {
    const hit = agingLookup(aging, unit, laser?.tenantName);
    // The report is Skyline's Credit Balance run for "Any With Open Credits":
    // a tenant missing from it has no credit, NOT no open items — they keep
    // the laser statement.
    const asOf = hit.kind === "found" ? hit.tenant.asOf : null;
    if (asOf && (!laser || asOf >= laserDate(laser, run?.updatedAt))) {
      if (hit.kind === "found") {
        const st = statementFromAging(hit.tenant, laser);
        return { st, asOf, agingAsOf: asOf, dates: { dataThrough: st.exportedAt ?? null, importedOn: null, stampRead: true, source: "aging" } };
      }
    }
  }
  if (!laser) return null;
  const st = laser;
  // `exportedAt` undefined = imported before the stamp was read; null = the
  // file itself records no creation time.
  const dates: DataDates = { dataThrough: st.exportedAt ?? null, importedOn: st.importedAt ?? run?.updatedAt ?? null, stampRead: st.exportedAt !== undefined, source: "statement" };
  return { st, dates, agingAsOf: null, asOf: (dates.dataThrough ?? dates.importedOn)?.slice(0, 10) ?? null };
}

/** How a saved receipt is re-derived: on the aging report it was sent on, or
 *  the laser statement alone. */
export async function statementForReceipt(rec: ReceiptRec) {
  return statementOf(rec.period, rec.unitRef, { aging: rec.agingAsOf ? await currentAging(rec.agingAsOf) : false });
}

