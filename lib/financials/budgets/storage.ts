// Single-manifest storage for the operating-budget workbooks. One
// manifest holds the list of uploaded workbooks (typically one per
// year per category). Each workbook is a parsed BudgetWorkbook from
// parser.ts.
//
// Multi-seed: when the manifest is empty, every entry in SEEDS is
// parsed + stored so the page is usable on first visit. Subsequent
// reads hit the saved manifest. Once the `seeded` flag sticks we
// never re-seed even if every entry is later deleted — staff can
// wipe a seed without it coming back.

import "server-only";
import fs from "fs/promises";
import path from "path";
import { getJSON, storeJSON } from "@/lib/storage";
import { parseBudgetWorkbook } from "./parser";
import type { BudgetWorkbook } from "./types";

const PREFIX = "financials-budgets";
const MANIFEST_ID = "manifest";

type SeedConfig = {
  /** Path under data/budgets/. */
  file: string;
  /** Human-readable label rendered in the page header. */
  label: string;
  /** Budget year for sorting + the Create-Live-Budget default-year math. */
  year: number;
  /** Stable id used as the manifest key. */
  id: string;
};

const SEEDS: SeedConfig[] = [
  // Shopping Centers — the bundled workbook's internal year column says
  // 2026 but the underlying data is the 2025 budget (2026 data hasn't
  // been worked yet); override on load so users see it tagged as 2025
  // and Create-Live-Budget defaults to 2026.
  {
    file: "Shopping_Centers_2026.xlsx",
    label: "Shopping Centers 2025 Operating Budget",
    year: 2025,
    id: "shopping-centers-2025",
  },
  // JV III (Lincoln Joint Venture III — office) — 2026 budget, parsed
  // from the staff-prepared workbook. The 7/2025 reprojection column
  // sits in cols 18/19 and is dropped by the YoY-noise filter.
  {
    file: "JV_III_2026.xlsx",
    label: "JV III 2026 Operating Budget",
    year: 2026,
    id: "jv-iii-2026",
  },
];

type Manifest = {
  workbooks: BudgetWorkbook[];
  /** Once true we never re-seed, even if every workbook is later deleted —
   *  staff can wipe seeds without them coming back. Tracks the SEEDS
   *  count so adding a new seed config triggers a one-shot top-up. */
  seeded: boolean;
  /** Highest seed-array length we've already processed; lets us add new
   *  seeds without wiping the whole manifest. */
  seedCount?: number;
  updatedAt: string;
};

/** Returns true when any line in a seed carries a YoY-variance %
 *  in its notes (e.g. "-16.09%"). Those were stored from col 19 of
 *  the source workbook before we learned they aren't real notes —
 *  re-parse to drop them. */
function seedHasYoyNoise(wb: BudgetWorkbook): boolean {
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

/** Returns true when the seed has no `allocations` metadata anywhere
 *  OR when any existing allocation is missing its full per-property
 *  `rows` breakdown (added later for the click-to-open modal). */
function seedMissingAllocations(wb: BudgetWorkbook): boolean {
  let any = false;
  let allHaveRows = true;
  const check = (line: import("./types").BudgetLine) => {
    if (line.allocations && line.allocations.length > 0) {
      any = true;
      for (const a of line.allocations) {
        if (!a.rows || a.rows.length === 0) allHaveRows = false;
      }
    }
    line.subLines?.forEach(check);
  };
  for (const property of wb.properties) {
    for (const section of property.sections) section.lines.forEach(check);
  }
  return !any || !allHaveRows;
}

/** Returns true when a known parent ("Leasing Salaries and Commissions",
 *  "Utilities", "General & Administrative", "Capital Improvements",
 *  "Outside Leasing Commissions") exists on the property but has no
 *  sub-lines — those parents always carry sub-lines in the workbook,
 *  so a missing array means we parsed under an older detector that
 *  didn't recognize GL-bearing sub-lines. */
function seedMissingGroupedSubLines(wb: BudgetWorkbook): boolean {
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

/** Returns true when a seed is missing level-2 sub-line detail under
 *  Building Maintenance (Contractual / Recurring → individual contract
 *  items from the Building Maint supporting tab). */
function seedMissingSubLineDetail(wb: BudgetWorkbook): boolean {
  for (const property of wb.properties) {
    for (const section of property.sections) {
      for (const line of section.lines) {
        if (line.isSubtotal) continue;
        if (!/^building maintenance$/i.test(line.label.trim())) continue;
        if (!line.subLines || line.subLines.length === 0) continue;
        const hasLevel2 = line.subLines.some(
          (s) => /contract|recurring/i.test(s.label) && s.subLines && s.subLines.length > 0,
        );
        if (hasLevel2) return false;
      }
    }
  }
  return true;
}

function seedNeedsReparse(wb: BudgetWorkbook): boolean {
  return seedMissingSubLineDetail(wb) ||
         seedHasYoyNoise(wb) ||
         seedMissingGroupedSubLines(wb) ||
         seedMissingAllocations(wb);
}

async function parseSeed(cfg: SeedConfig): Promise<BudgetWorkbook | null> {
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "data", "budgets", cfg.file));
    const wb = parseBudgetWorkbook(buf, cfg.label);
    // Pin id + year — the file's internal metadata may differ (the SC
    // file says 2026 in its own header even though the user told us the
    // numbers represent 2025).
    wb.year = cfg.year;
    wb.id = cfg.id;
    return wb.properties.length > 0 ? wb : null;
  } catch {
    return null;
  }
}

async function loadManifest(): Promise<BudgetWorkbook[]> {
  const m = (await getJSON(PREFIX, MANIFEST_ID)) as Manifest | null;

  // Top-up: when SEEDS gains a new entry, parse just the new ones and
  // append. Existing entries keep their (possibly user-edited) state.
  let workbooks = m?.workbooks ?? [];
  let migrated = false;
  if (!m || (workbooks.length === 0 && !m.seeded)) {
    // First-ever read — seed everything.
    const parsed = await Promise.all(SEEDS.map(parseSeed));
    workbooks = parsed.filter((wb): wb is BudgetWorkbook => wb !== null);
    await saveManifest(workbooks, true);
    return workbooks;
  }
  if ((m.seedCount ?? 0) < SEEDS.length) {
    // New seed configs added since last load. Only add ones whose id
    // isn't already in the manifest.
    const present = new Set(workbooks.map((w) => w.id));
    for (const cfg of SEEDS) {
      if (present.has(cfg.id)) continue;
      const wb = await parseSeed(cfg);
      if (wb) workbooks.push(wb);
    }
    migrated = true;
  }

  // One-shot id/year correction for the legacy single-seed Shopping
  // Centers manifest (saved with year=2026 before we learned the data
  // represents 2025).
  const scSeed = SEEDS.find((s) => s.id === "shopping-centers-2025")!;
  for (const wb of workbooks) {
    if (
      wb.kind === "imported" &&
      wb.year === 2026 &&
      wb.id !== scSeed.id &&
      /shopping centers/i.test(wb.label) &&
      /operating budget/i.test(wb.label)
    ) {
      wb.id = scSeed.id;
      wb.label = scSeed.label;
      wb.year = scSeed.year;
      migrated = true;
    }
  }

  // Re-parse seeds that pre-date a parser improvement (sub-line detail,
  // allocation rows, YoY-noise filter, etc.). Per-seed so a re-parse of
  // one doesn't disturb another.
  for (const cfg of SEEDS) {
    const idx = workbooks.findIndex((w) => w.id === cfg.id);
    if (idx < 0) continue;
    if (seedNeedsReparse(workbooks[idx])) {
      const reparsed = await parseSeed(cfg);
      if (reparsed) {
        workbooks[idx] = reparsed;
        migrated = true;
      }
    }
  }

  if (migrated) await saveManifest(workbooks, true);
  return workbooks;
}

async function saveManifest(workbooks: BudgetWorkbook[], seeded = true): Promise<void> {
  await storeJSON(PREFIX, MANIFEST_ID, {
    workbooks,
    seeded,
    seedCount: SEEDS.length,
    updatedAt: new Date().toISOString(),
  });
}

export async function listBudgets(): Promise<BudgetWorkbook[]> {
  const all = await loadManifest();
  // Newest year first, then category name.
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
