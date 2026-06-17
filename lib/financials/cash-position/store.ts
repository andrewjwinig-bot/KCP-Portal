// Weekly Cash Position storage — one blob per week-ending Friday ("YYYY-MM-DD").
// Each week holds per-entity bucket values + a note. A new week seeds from the
// most recent prior week so balances carry forward until updated (the bank-
// sourced figures change slowly week to week).

import "server-only";
import { storeJSON, listJSON, getJSON } from "@/lib/storage";
import type { CashPositionBucket, CashPositionEntry } from "./model";

const PREFIX = "financials-cash-position";

export type CashPositionWeek = {
  weekEnding: string; // YYYY-MM-DD (Friday)
  entries: Record<string, CashPositionEntry>;
  updatedAt: string;
  updatedBy?: string;
};

export async function getWeek(weekEnding: string): Promise<CashPositionWeek | null> {
  return (await getJSON(PREFIX, weekEnding)) as CashPositionWeek | null;
}

/** Every saved week key, newest first. */
export async function listWeeks(): Promise<string[]> {
  const all = (await listJSON(PREFIX)) as CashPositionWeek[];
  return all.map((w) => w.weekEnding).filter(Boolean).sort((a, b) => (a < b ? 1 : -1));
}

/** The week to seed a brand-new week from: the latest saved week before it. */
async function priorWeekEntries(before: string): Promise<Record<string, CashPositionEntry>> {
  const weeks = await listWeeks();
  const prev = weeks.find((w) => w < before);
  if (!prev) return {};
  const doc = await getWeek(prev);
  // Carry balances forward, drop notes (they're week-specific).
  const out: Record<string, CashPositionEntry> = {};
  for (const [code, e] of Object.entries(doc?.entries ?? {})) out[code] = { values: { ...e.values } };
  return out;
}

/** Read a week, seeding it from the prior week on first access (not persisted
 *  until an edit is saved). */
export async function getWeekSeeded(weekEnding: string): Promise<CashPositionWeek> {
  const existing = await getWeek(weekEnding);
  if (existing) return existing;
  return { weekEnding, entries: await priorWeekEntries(weekEnding), updatedAt: "", };
}

/** Apply one cell edit (a bucket value or a note) to a week, creating it (seeded
 *  from the prior week) on first write. */
export async function applyEdit(params: {
  weekEnding: string;
  code: string;
  bucket?: CashPositionBucket;
  /** Bucket value (signed) or null to clear. Ignored when saving a note. */
  value?: number | null;
  note?: string;
  updatedBy?: string;
}): Promise<CashPositionWeek> {
  const { weekEnding, code, bucket, value, note, updatedBy } = params;
  let doc = await getWeek(weekEnding);
  if (!doc) {
    doc = { weekEnding, entries: await priorWeekEntries(weekEnding), updatedAt: new Date().toISOString(), updatedBy };
  }
  const entry: CashPositionEntry = doc.entries[code] ?? { values: {} };
  if (bucket) {
    if (value == null) delete entry.values[bucket];
    else entry.values[bucket] = value;
  }
  if (note !== undefined) {
    if (note.trim()) entry.note = note.trim();
    else delete entry.note;
  }
  doc.entries[code] = entry;
  doc.updatedAt = new Date().toISOString();
  if (updatedBy) doc.updatedBy = updatedBy;
  await storeJSON(PREFIX, weekEnding, doc);
  return doc;
}
