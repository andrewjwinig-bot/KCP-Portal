// Single-manifest storage for the operating-budget workbooks. One manifest
// holds the list of uploaded workbooks (typically a small handful — one
// per year per category). Each workbook is a parsed BudgetWorkbook from
// parser.ts.
//
// First-read auto-seed: when the manifest is empty, we parse and store
// the bundled 2026 Shopping Centers workbook so the page is usable on
// first visit without a manual upload. Subsequent reads hit the saved
// manifest and skip the seed.

import "server-only";
import fs from "fs/promises";
import path from "path";
import { getJSON, storeJSON } from "@/lib/storage";
import { parseBudgetWorkbook } from "./parser";
import type { BudgetWorkbook } from "./types";

const PREFIX = "financials-budgets";
const MANIFEST_ID = "manifest";
// The bundled workbook's internal year column says 2026 but the actual
// underlying data is the 2025 budget (2026 data hasn't been worked yet);
// override on load so users see it tagged as 2025 and the Create-Live-
// Budget default year flows to 2026.
const SEED_FILE = path.join(process.cwd(), "data", "budgets", "Shopping_Centers_2026.xlsx");
const SEED_LABEL = "Shopping Centers 2025 Operating Budget";
const SEED_YEAR = 2025;
const SEED_ID = "shopping-centers-2025";

type Manifest = {
  workbooks: BudgetWorkbook[];
  /** Once true we never re-seed, even if every workbook is later deleted —
   *  staff can wipe the seed without it coming back. */
  seeded: boolean;
  updatedAt: string;
};

/** Returns true when any line in the seed carries a YoY-variance %
 *  in its notes (e.g. "-16.09%"). Those were stored from col 19 of
 *  the source workbook before we learned they aren't real notes —
 *  re-parse to drop them. */
function seedHasYoyNoise(wb: BudgetWorkbook): boolean {
  if (wb.id !== SEED_ID) return false;
  const variancePct = /^[-+]?\d+(\.\d+)?\s*%$/;
  for (const property of wb.properties) {
    for (const section of property.sections) {
      for (const line of section.lines) {
        if (line.notes && variancePct.test(line.notes.trim())) return true;
      }
    }
  }
  return false;
}

/** Returns true when "Leasing Salaries and Commissions", "Utilities",
 *  "General & Administrative", "Capital Improvements", or "Outside
 *  Leasing Commissions" exist on the property but have no sub-lines —
 *  those parents always carry sub-lines in the workbook, so a missing
 *  array means we parsed under the pre-loosened sub-line detector that
 *  required col 0 to be empty. */
function seedMissingGroupedSubLines(wb: BudgetWorkbook): boolean {
  if (wb.id !== SEED_ID) return false;
  const expectsSubLines = /^(leasing salaries and commissions|utilities|general & administrative|capital improvements|outside leasing commissions)$/i;
  for (const property of wb.properties) {
    for (const section of property.sections) {
      for (const line of section.lines) {
        if (line.isSubtotal) continue;
        if (expectsSubLines.test(line.label.trim()) && (!line.subLines || line.subLines.length === 0)) {
          return true;
        }
      }
    }
  }
  return false;
}

/** Returns true when the seed workbook in the manifest is missing
 *  the latest level of sub-line detail. Earlier deploys saved the seed
 *  before the in-sheet sub-line parser (level 1) or the Building Maint
 *  tab parser (level 2 under Building Maint.-Contractual / -Recurring)
 *  existed; we re-parse those once on next read so the expansion works.
 *  Treats absence of EITHER level as missing — the level-2 probe is
 *  the strongest signal we can check. */
function seedMissingSubLineDetail(wb: BudgetWorkbook): boolean {
  if (wb.id !== SEED_ID) return false;
  for (const property of wb.properties) {
    for (const section of property.sections) {
      for (const line of section.lines) {
        if (line.isSubtotal) continue;
        if (!/^building maintenance$/i.test(line.label.trim())) continue;
        if (!line.subLines || line.subLines.length === 0) continue;
        // Level 1 present — now check level 2: any of Contractual /
        // Recurring sub-lines should carry their own subLines.
        const hasLevel2 = line.subLines.some(
          (s) => /contract|recurring/i.test(s.label) && s.subLines && s.subLines.length > 0,
        );
        if (hasLevel2) return false; // current; no re-parse needed
      }
    }
  }
  return true;
}

async function reseedFromBundle(): Promise<BudgetWorkbook | null> {
  try {
    const buf = await fs.readFile(SEED_FILE);
    const wb = parseBudgetWorkbook(buf, SEED_LABEL);
    wb.year = SEED_YEAR;
    wb.id = SEED_ID;
    return wb.properties.length > 0 ? wb : null;
  } catch {
    return null;
  }
}

async function loadManifest(): Promise<BudgetWorkbook[]> {
  const m = (await getJSON(PREFIX, MANIFEST_ID)) as Manifest | null;
  if (m?.workbooks?.length) {
    // One-shot migration: an earlier deploy seeded the bundled workbook
    // with the year stamped as 2026 (matching the file metadata). The
    // underlying data is actually the 2025 budget — re-stamp on load so
    // existing stores reflect that.
    let migrated = false;
    for (const wb of m.workbooks) {
      if (
        wb.kind === "imported" &&
        wb.year === 2026 &&
        wb.id !== SEED_ID &&
        /shopping centers/i.test(wb.label) &&
        /operating budget/i.test(wb.label)
      ) {
        wb.id = SEED_ID;
        wb.label = SEED_LABEL;
        wb.year = SEED_YEAR;
        migrated = true;
      }
    }

    // Second migration: re-parse the seed if it pre-dates the in-sheet
    // sub-line parser (level 1 / level 2) OR if it still carries the
    // stale YoY variance % data we used to store as notes.
    const seed = m.workbooks.find((wb) => wb.id === SEED_ID);
    if (seed && (seedMissingSubLineDetail(seed) || seedHasYoyNoise(seed) || seedMissingGroupedSubLines(seed))) {
      const reparsed = await reseedFromBundle();
      if (reparsed) {
        const i = m.workbooks.indexOf(seed);
        m.workbooks[i] = reparsed;
        migrated = true;
      }
    }

    if (migrated) await saveManifest(m.workbooks, true);
    return m.workbooks;
  }
  if (m?.seeded) return m.workbooks ?? [];
  // First-ever read — try to seed from the bundled workbook.
  try {
    const buf = await fs.readFile(SEED_FILE);
    const wb = parseBudgetWorkbook(buf, SEED_LABEL);
    // Pin the year + id since the source file's internal year metadata
    // doesn't match the data the user told us this represents.
    wb.year = SEED_YEAR;
    wb.id = SEED_ID;
    if (wb.properties.length > 0) {
      await saveManifest([wb], true);
      return [wb];
    }
  } catch {
    // Seed file missing or unparseable — mark seeded so we don't retry
    // on every request.
    await saveManifest([], true);
  }
  return [];
}

async function saveManifest(workbooks: BudgetWorkbook[], seeded = true): Promise<void> {
  await storeJSON(PREFIX, MANIFEST_ID, {
    workbooks,
    seeded,
    updatedAt: new Date().toISOString(),
  });
}

export async function listBudgets(): Promise<BudgetWorkbook[]> {
  const all = await loadManifest();
  // Newest year first.
  return [...all].sort((a, b) => b.year - a.year || a.label.localeCompare(b.label));
}

export async function getBudget(id: string): Promise<BudgetWorkbook | null> {
  const all = await loadManifest();
  return all.find((w) => w.id === id) ?? null;
}

export async function saveBudget(wb: BudgetWorkbook): Promise<void> {
  const all = await loadManifest();
  const idx = all.findIndex((w) => w.id === wb.id);
  if (idx >= 0) all[idx] = wb;
  else all.push(wb);
  await saveManifest(all);
}

export async function deleteBudget(id: string): Promise<boolean> {
  const all = await loadManifest();
  const next = all.filter((w) => w.id !== id);
  if (next.length === all.length) return false;
  await saveManifest(next);
  return true;
}
