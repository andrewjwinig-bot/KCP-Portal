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
const SEED_FILE = path.join(process.cwd(), "data", "budgets", "Shopping_Centers_2026.xlsx");
const SEED_LABEL = "Shopping Centers 2026 Operating Budget";

type Manifest = {
  workbooks: BudgetWorkbook[];
  /** Once true we never re-seed, even if every workbook is later deleted —
   *  staff can wipe the seed without it coming back. */
  seeded: boolean;
  updatedAt: string;
};

async function loadManifest(): Promise<BudgetWorkbook[]> {
  const m = (await getJSON(PREFIX, MANIFEST_ID)) as Manifest | null;
  if (m?.workbooks?.length) return m.workbooks;
  if (m?.seeded) return m.workbooks ?? [];
  // First-ever read — try to seed from the bundled 2026 file.
  try {
    const buf = await fs.readFile(SEED_FILE);
    const wb = parseBudgetWorkbook(buf, SEED_LABEL);
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
