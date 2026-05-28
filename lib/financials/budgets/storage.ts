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
  // Shopping Centers — staff-prepared 2026 budget.
  {
    file: "Shopping_Centers_2026.xlsx",
    label: "Shopping Centers 2026 Operating Budget",
    year: 2026,
    id: "shopping-centers-2026",
  },
  // JV III (Lincoln Joint Venture III — office) — staff-prepared 2026
  // budget. 7/2025 reprojection column in cols 18/19 is dropped by the
  // YoY-noise filter.
  {
    file: "JV_III_2026.xlsx",
    label: "JV III 2026 Operating Budget",
    year: 2026,
    id: "jv-iii-2026",
  },
  // NI LLC (Neshaminy Interplex LLC — office) — staff-prepared 2026
  // budget covering buildings 4050 / 4060 / 4070 / 4080 / 40A0 / 40B0 /
  // 40C0 plus a 4000 "Unallocated Expenses" sheet for LLC-level
  // expenses that don't belong to a specific building.
  {
    file: "NI_LLC_2026.xlsx",
    label: "NI LLC 2026 Operating Budget",
    year: 2026,
    id: "ni-llc-2026",
  },
  // The Office Works (4900) — one-off "Other Budgets" book. Different
  // sheet shape from the property workbooks (months at col F-Q, no
  // occupancy header, CIP member roster on a supporting tab) — parsed
  // by the focused parseOfficeWorksSheet path.
  {
    file: "Office_Works_2026.xlsx",
    label: "Office Works 2026 Operating Budget",
    year: 2026,
    id: "office-works-2026",
  },
  // LIK Management (2010) — KCP corporate operating budget. The "LIK
  // Budget 2026" sheet has its own layout (Jan at col C, no property /
  // occupancy header, parent rows infer their sub-lines from a sum-
  // matching heuristic) — parsed by parseLikBudgetSheet. The Notes to
  // Projections + 10 Year Projection tabs are ignored.
  {
    file: "LIK_Mgmt_2026.xlsx",
    label: "LIK Management 2026 Operating Budget",
    year: 2026,
    id: "lik-mgmt-2026",
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
 *  in its notes (e.g. "-16.09%") OR a pure placeholder dash that an
 *  earlier parse stored as a real note (the page would otherwise show
 *  a misleading ⓘ info icon). Both cases warrant a re-parse. */
function seedHasYoyNoise(wb: BudgetWorkbook): boolean {
  const variancePct = /^[-+]?\d+(\.\d+)?\s*%$/;
  const placeholder = /^[-—–\s]+$/;
  for (const property of wb.properties) {
    for (const section of property.sections) {
      for (const line of section.lines) {
        const n = line.notes?.trim();
        if (n && (variancePct.test(n) || placeholder.test(n))) return true;
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

/** Returns true when the seed has a rollup sheet but doesn't surface
 *  it as a selectable "Consolidated" property — added later so the
 *  dropdown lets staff jump to the portfolio view alongside the
 *  individual buildings. Also returns true when the CONSOLIDATED
 *  entry still carries the cryptic row-0 label (e.g. "Consolidated
 *  - 1, 2, 4") from before rollupDisplayName mapped it to the
 *  fund-aware name (JV III, NI LLC, All Shopping Centers, …). */
function seedMissingConsolidatedEntry(wb: BudgetWorkbook): boolean {
  if (!wb.rollup) return false;
  const consolidated = wb.properties.find((p) => p.propertyCode === "CONSOLIDATED");
  if (!consolidated) return true;
  // Legacy name shape — the cleaner one is "JV III" / "NI LLC" /
  // "All Shopping Centers" / "All Residential". Anything starting
  // with the literal "Consolidated -" is the pre-mapping cell value.
  if (/^consolidated\s*-/i.test(consolidated.propertyName.trim())) return true;
  return false;
}

/** Returns true when the workbook's CONSOLIDATED property has all-zero
 *  occupancy SF even though the underlying buildings carry data — the
 *  rollup-summing logic was added later, so existing seeds need a
 *  re-parse to pick it up. */
function seedConsolidatedMissingOccSqft(wb: BudgetWorkbook): boolean {
  const consolidated = wb.properties.find((p) => p.propertyCode === "CONSOLIDATED");
  if (!consolidated) return false;
  if (consolidated.occupancySqft.some((s) => s > 0)) return false;
  const buildings = wb.properties.filter((p) => p.propertyCode !== "CONSOLIDATED");
  return buildings.some((p) => p.occupancySqft.some((s) => s > 0));
}

/** Returns true when a known main-P&L section (Revenues / Reimbursements
 *  / Reimbursable Expenses / Non-Reimbursable Expenses / Debt Service /
 *  Capital Improvements) on any property has line items but no subtotal
 *  row — staff need the section footer to spot-check totals. */
function seedMissingMainPnlSubtotals(wb: BudgetWorkbook): boolean {
  const expected = /^(revenues?|reimbursements?|reimbursable expenses?|non-reimbursable expenses?|capital improvements?|debt service)$/i;
  for (const property of wb.properties) {
    for (const section of property.sections) {
      if (!expected.test(section.name.trim())) continue;
      if (section.lines.length === 0) continue;
      if (!section.lines.some((l) => l.isSubtotal)) return true;
    }
  }
  return false;
}

/** Returns true when a multi-building workbook (CONSOLIDATED + 2+
 *  buildings) has non-zero debt service GLs on the buildings but no
 *  allocation metadata yet — added later so each building's
 *  Interest / Mortgage Amortization line opens the per-building
 *  allocation modal. */
function seedMissingDebtAllocations(wb: BudgetWorkbook): boolean {
  // Only office workbooks (JV III, NI LLC) carry fund-level debt that
  // gets allocated across buildings — Shopping Centers have individual
  // property loans, so skipping debt synthesis there is correct, not
  // missing.
  if (wb.category !== "Office") return false;
  const consolidated = wb.properties.find((p) => p.propertyCode === "CONSOLIDATED");
  const buildings = wb.properties.filter((p) => p.propertyCode !== "CONSOLIDATED");
  if (!consolidated || buildings.length < 2) return false;
  for (const gl of ["9210-8501", "2740-8501", "2740-0000"]) {
    const buildingLines = buildings
      .map((b) => b.sections.flatMap((s) => s.lines).find((l) => !l.isSubtotal && l.glAccount === gl && l.total !== 0))
      .filter((l): l is import("./types").BudgetLine => !!l);
    if (buildingLines.length < 2) continue;
    const missing = buildingLines.some((l) => !(l.allocations ?? []).some((a) => a.glAccount === gl));
    if (missing) return true;
  }
  return false;
}

/** Office workbooks ship a per-property Water Sewer breakdown (Aqua /
 *  BCWSA / etc.) — the parser was added later, so existing office
 *  seeds need a re-parse to surface it on the Water & Sewer line. */
function seedMissingWaterSewerSubLines(wb: BudgetWorkbook): boolean {
  if (wb.category !== "Office") return false;
  for (const property of wb.properties) {
    if (property.propertyCode === "CONSOLIDATED") continue;
    const ws = property.sections
      .flatMap((s) => s.lines)
      .find((l) => !l.isSubtotal && /^water\s*(&|and)?\s*sewer$/i.test(l.label.trim()) && l.total !== 0);
    if (ws && (!ws.subLines || ws.subLines.length === 0)) return true;
  }
  return false;
}

/** Returns true when the Non-Reimbursable Expenses "Building
 *  Maintenance" line has level-2 detail attached. That tab covers
 *  Reimbursable-side CAM maintenance only; the Non-Reimbursable line
 *  is a hardcoded total. Earlier deploys attached the detail
 *  indiscriminately — re-parse so the misattached sub-lines drop. */
function seedMisattachedNonReimbBuildingMaintDetail(wb: BudgetWorkbook): boolean {
  for (const property of wb.properties) {
    for (const section of property.sections) {
      if (!/^non-reimbursable expenses?$/i.test(section.name.trim())) continue;
      for (const line of section.lines) {
        if (line.isSubtotal) continue;
        if (!/^building maintenance$/i.test(line.label.trim())) continue;
        if (!line.subLines) continue;
        const hasLevel2 = line.subLines.some((s) => (s.subLines?.length ?? 0) > 0);
        if (hasLevel2) return true;
      }
    }
  }
  return false;
}

/** Returns true when the workbook has Management Fee lines but none
 *  carry the `feePercent` field — added later so the rate from the
 *  workbook formula renders inline next to the label. */
function seedMissingMgmtFeePercent(wb: BudgetWorkbook): boolean {
  let anyBuilding = false;
  let buildingHasPct = false;
  let consolidatedHasInfo: boolean | null = null;
  for (const property of wb.properties) {
    const isConsolidated = property.propertyCode === "CONSOLIDATED";
    for (const section of property.sections) {
      for (const line of section.lines) {
        if (line.isSubtotal) continue;
        if (!/management fee/i.test(line.label)) continue;
        if (!line.glAccount?.startsWith("6610-")) continue;
        if (isConsolidated) {
          if (consolidatedHasInfo === null) consolidatedHasInfo = false;
          if (line.feePercent != null || line.feePercentRange) consolidatedHasInfo = true;
        } else {
          anyBuilding = true;
          if (line.feePercent != null) buildingHasPct = true;
        }
      }
    }
  }
  if (anyBuilding && !buildingHasPct) return true;
  if (consolidatedHasInfo === false) return true;
  return false;
}

/** Returns true when The Office Works seed has no occupancy data on
 *  its 4900 property — derived later from the rent roll tab so the
 *  page can render the occupancy strip in the same shape as the
 *  property workbooks. */
function seedMissingTowOccupancy(wb: BudgetWorkbook): boolean {
  if (wb.id !== "office-works-2026") return false;
  const property = wb.properties.find((p) => p.propertyCode === "4900");
  if (!property) return false;
  if (property.rentableSqft <= 0) return true;
  return property.occupancySqft.every((s) => s === 0);
}

/** Returns true when the LIK Management seed still ships the workbook's
 *  raw rollup labels ("Net Income" instead of "NET OPERATING INCOME")
 *  or is missing the synthesized "TOTAL OPERATING EXPENSES" / "CASH
 *  FLOW BEFORE DEBT SERVICE" — added later so the headline pills and
 *  between-section SubtotalCards render consistently with the property
 *  workbooks. */
function seedMissingLikRollupNormalization(wb: BudgetWorkbook): boolean {
  if (wb.id !== "lik-mgmt-2026") return false;
  const property = wb.properties.find((p) => p.propertyCode === "2010");
  if (!property) return false;
  const names = new Set(property.rollups.map((r) => r.name.toUpperCase()));
  if (names.has("NET INCOME")) return true;
  if (!names.has("NET OPERATING INCOME")) return true;
  if (!names.has("TOTAL OPERATING EXPENSES")) return true;
  if (!names.has("CASH FLOW BEFORE DEBT SERVICE")) return true;
  return false;
}

/** Returns true when The Office Works seed is missing the CIP tenant
 *  detail on its "CIP Memberships" line — added later so the page can
 *  open a per-tenant modal off the Monthly Rent Roll & CIP tab. */
function seedMissingCipDetail(wb: BudgetWorkbook): boolean {
  if (wb.id !== "office-works-2026") return false;
  const property = wb.properties.find((p) => p.propertyCode === "4900");
  if (!property) return false;
  const line = property.sections
    .flatMap((s) => s.lines)
    .find((l) => !l.isSubtotal && (l.glAccount === "4810-8502" || /^cip\s+memberships?$/i.test(l.label.trim())));
  if (!line) return false;
  return !line.cipDetail || line.cipDetail.tenants.length === 0;
}

/** Returns true when The Office Works Reimbursements / Operation
 *  Expenses sections still carry workbook noise that staff has asked
 *  us to fold into the label — chargeback codes, per-page Copier
 *  rates, the Postage / Clerical context notes, or the "non-
 *  reimbursible" tag on Office Supplies. */
function seedHasLegacyTowReimbLabels(wb: BudgetWorkbook): boolean {
  if (wb.id !== "office-works-2026") return false;
  const property = wb.properties.find((p) => p.propertyCode === "4900");
  if (!property) return false;
  const reimb = property.sections.find((s) => /^reimbursements?$/i.test(s.name.trim()));
  if (reimb) {
    for (const line of reimb.lines) {
      if (line.isSubtotal) continue;
      // Copier rate still sitting in notes
      if (/^copier/i.test(line.label) && /\$\s*0?\.\d+/.test(line.notes ?? "")) return true;
      // Postage / Clerical haven't been folded into the label yet
      if (/^postage$/i.test(line.label.trim()) && line.notes) return true;
      if (/^clerical$/i.test(line.label.trim()) && line.notes) return true;
      // Any other line still has chargeback codes in parens
      if (!/^copier/i.test(line.label) && !/(cost \+20%|kcp phone)/i.test(line.label) && /\(/.test(line.label)) return true;
    }
  }
  const ops = property.sections.find((s) => /^operation\s+expenses?$/i.test(s.name.trim()));
  if (ops) {
    for (const line of ops.lines) {
      if (line.isSubtotal) continue;
      if (/^office\s+supplies$/i.test(line.label.trim())) return true;
      if (/^copier/i.test(line.label) && /\$\s*0?\.\d+/.test(line.notes ?? "")) return true;
    }
  }
  return false;
}

/** Returns true when any line still uses the legacy "Leasing Salaries
 *  and Commissions" spelling — staff prefer the ampersand form for
 *  the page header. */
function seedHasLegacyLeasingLabel(wb: BudgetWorkbook): boolean {
  const re = /^Leasing Salaries and Commissions$/i;
  const visit = (line: BudgetWorkbook["properties"][number]["sections"][number]["lines"][number]): boolean => {
    if (re.test(line.label.trim())) return true;
    return !!line.subLines && line.subLines.some(visit);
  };
  for (const property of wb.properties) {
    for (const section of property.sections) {
      if (section.lines.some(visit)) return true;
    }
  }
  return false;
}

function seedNeedsReparse(wb: BudgetWorkbook): boolean {
  return seedMissingSubLineDetail(wb) ||
         seedHasYoyNoise(wb) ||
         seedMissingGroupedSubLines(wb) ||
         seedMissingAllocations(wb) ||
         seedMissingConsolidatedEntry(wb) ||
         seedConsolidatedMissingOccSqft(wb) ||
         seedMissingMainPnlSubtotals(wb) ||
         seedMissingDebtAllocations(wb) ||
         seedMissingWaterSewerSubLines(wb) ||
         seedMisattachedNonReimbBuildingMaintDetail(wb) ||
         seedMissingMgmtFeePercent(wb) ||
         seedHasLegacyLeasingLabel(wb) ||
         seedMissingCipDetail(wb) ||
         seedHasLegacyTowReimbLabels(wb) ||
         seedMissingTowOccupancy(wb) ||
         seedMissingLikRollupNormalization(wb);
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

  // Legacy-id cleanup. Older deploys saved the Shopping Centers seed
  // under id "shopping-centers-2025" (and the user has since confirmed
  // every budget is 2026). Drop any legacy id so the top-up logic
  // above adds the canonical 2026 entry on the next pass.
  const legacyIds = new Set(["shopping-centers-2025"]);
  const beforeLegacy = workbooks.length;
  workbooks = workbooks.filter((w) => !legacyIds.has(w.id));
  if (workbooks.length !== beforeLegacy) {
    // Top-up the missing seed now that the legacy entry's been dropped.
    const present = new Set(workbooks.map((w) => w.id));
    for (const cfg of SEEDS) {
      if (present.has(cfg.id)) continue;
      const wb = await parseSeed(cfg);
      if (wb) workbooks.push(wb);
    }
    migrated = true;
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
