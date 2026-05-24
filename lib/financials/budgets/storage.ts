// Single-manifest storage for the operating-budget workbooks. One manifest
// holds the list of uploaded workbooks (typically a small handful — one
// per year per category). Each workbook is a parsed BudgetWorkbook from
// parser.ts.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { BudgetWorkbook } from "./types";

const PREFIX = "financials-budgets";
const MANIFEST_ID = "manifest";

type Manifest = {
  workbooks: BudgetWorkbook[];
  updatedAt: string;
};

async function loadManifest(): Promise<BudgetWorkbook[]> {
  const m = (await getJSON(PREFIX, MANIFEST_ID)) as Manifest | null;
  return m?.workbooks ?? [];
}

async function saveManifest(workbooks: BudgetWorkbook[]): Promise<void> {
  await storeJSON(PREFIX, MANIFEST_ID, {
    workbooks,
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
