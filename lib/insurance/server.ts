// Server side of the insurance Statement of Values: the stored copy of the
// broker's form, and what the portal knows about each property.
//
// The uploaded file is kept (base64 in one JSON blob — the form is ~50 KB) so
// the page reopens on it and the filled copy is always built from the broker's
// OWN file, formatting and all, rather than from a reconstruction of it.

import "server-only";
import { getJSON, storeJSON, deleteJSON } from "@/lib/storage";
import { newWorkbook } from "@/lib/excel/theme";
import { allFacts } from "@/lib/properties/facts";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { amenityFor } from "@/lib/rentroll/amenities";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import {
  readSov, planFill, applyFill, portalFactsFor,
  type PortalFacts, type RollSummary, type SovSheet, type PlanOptions,
} from "./sov";

const PREFIX = "insurance-sov";
const ID = "current";

export type StoredSov = {
  fileName: string;
  uploadedAt: string;
  uploadedBy: string | null;
  base64: string;
};

export async function getStoredSov(): Promise<StoredSov | null> {
  return (await getJSON(PREFIX, ID)) as StoredSov | null;
}

export async function saveStoredSov(s: StoredSov): Promise<void> {
  await storeJSON(PREFIX, ID, s);
}

export async function clearStoredSov(): Promise<void> {
  await deleteJSON(PREFIX, ID);
}

/** Load a form into a workbook. `newWorkbook()` rather than a bare ExcelJS
 *  workbook for its `fullCalcOnLoad`: every value we write moves the form's
 *  own Price per SF and Total formulas, and ExcelJS keeps their OLD cached
 *  results — without a recalc on open, the broker would read last year's
 *  totals beside this year's areas. The load replaces the creator and the
 *  calc flags with the file's own, so the flag is set again afterwards. */
export async function loadWorkbook(buf: Buffer) {
  const wb = newWorkbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  wb.calcProperties.fullCalcOnLoad = true;
  return wb;
}

export async function parseSovBuffer(buf: Buffer): Promise<SovSheet | null> {
  return readSov(await loadWorkbook(buf));
}

/** Rent-roll area, suite count and annualised billings, per property. */
async function rollSummaries(): Promise<Record<string, RollSummary>> {
  const roll = await resolveCurrentRentroll().catch(() => null);
  const out: Record<string, RollSummary> = {};
  for (const p of roll?.properties ?? []) {
    const suites = p.units.filter((u) => !u.amenity && !amenityFor(u.unitRef));
    out[p.propertyCode] = {
      totalSqft: p.totalSqft,
      units: suites.length,
      annualGross: 12 * p.units.reduce((s, u) => s + (u.grossRentTotal || 0), 0),
    };
  }
  return out;
}

export async function portalData(): Promise<{
  portal: Record<string, PortalFacts>;
  facts: Record<string, Record<string, unknown>>;
}> {
  const [facts, rolls] = await Promise.all([allFacts().catch(() => ({})), rollSummaries()]);
  const portal: Record<string, PortalFacts> = {};
  for (const d of PROPERTY_DEFS) portal[d.id] = portalFactsFor(facts[d.id] as Record<string, unknown>, rolls[d.id]);
  return { portal, facts: facts as Record<string, Record<string, unknown>> };
}

/** The broker's form with the portal's data written in. */
export async function buildFilledSov(stored: StoredSov, opts: PlanOptions): Promise<{ buf: Buffer; written: number } | null> {
  const wb = await loadWorkbook(Buffer.from(stored.base64, "base64"));
  const sov = readSov(wb);
  if (!sov) return null;
  const { portal } = await portalData();
  const plan = planFill(sov, portal, opts);
  const ws = wb.getWorksheet(sov.sheetName)!;
  const written = applyFill(ws, sov, plan);
  return { buf: Buffer.from(await wb.xlsx.writeBuffer()), written };
}
