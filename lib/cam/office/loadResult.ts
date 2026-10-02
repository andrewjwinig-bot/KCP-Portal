// Shared office-reconciliation loader: assembles tenant inputs (config + resets
// + snow exclusions) and reconciles one property/year to a BuildingReconResult.
// Used by the public tenant-link statement page so it computes the exact same
// numbers the gated CAM recon route does. (The gated route additionally builds
// the editable Final Expense Summary / contacts / warnings, which the public
// statement doesn't need.)

import "server-only";
import { reconcileBuilding } from "./compute";
import { assembleTenantInputs, type OfficeLeaseConfig, type ResetInfo, type SnowExclusionInfo } from "./assemble";
import { OFFICE_RECON_FIXTURES } from "./registry";
import { getOverrides, mergeConfig } from "./configStore";
import { getUnitConfigs } from "./unitConfig";
import { getExpenseOverrides } from "./expenseStore";
import { finalsFromSummary, mergeExpenseSummary } from "./expenseSummary";
import { getJSON } from "@/lib/storage";
import { createMapStore } from "@/lib/collectionStore";

const ADJUSTMENTS_FROM_YEAR = 2026;

async function loadResets(): Promise<Record<string, ResetInfo>> {
  const s = (await getJSON("base-year-resets", "all")) as
    | { resets?: Record<string, { resetDate: string; originalBaseYear: number | null; newBaseYear: number }> }
    | null;
  return s?.resets ?? {};
}

const snowStore = createMapStore<{ effectiveMonth: number; effectiveYear: number }>({ prefix: "snow-base-exclusions" });
async function loadSnowExclusions(): Promise<Record<string, SnowExclusionInfo>> {
  try {
    const all = await snowStore.all();
    const out: Record<string, SnowExclusionInfo> = {};
    for (const [u, ex] of Object.entries(all)) {
      if (ex && Number.isFinite(ex.effectiveMonth) && Number.isFinite(ex.effectiveYear)) {
        out[u] = { effectiveMonth: ex.effectiveMonth, effectiveYear: ex.effectiveYear };
      }
    }
    return out;
  } catch { return {}; }
}

export type LoadedOfficeRecon = { result: ReturnType<typeof reconcileBuilding> };

/** Reconcile one office property/year. Returns null when there's no fixture for
 *  that property/year (the caller maps that to a 404). */
export async function loadOfficeRecon(property: string, year: number): Promise<LoadedOfficeRecon | null> {
  const fixture = OFFICE_RECON_FIXTURES[property];
  const reconYear = fixture?.byYear[year];
  if (!fixture || !reconYear) return null;

  const unitConfigs = await getUnitConfigs();
  const seededWithUnit: Record<string, OfficeLeaseConfig> = {};
  for (const [unitRef, base] of Object.entries(reconYear.leaseConfig)) {
    const uc = unitConfigs[unitRef] ?? {};
    seededWithUnit[unitRef] = {
      ...base,
      ...(uc.proRataPct != null ? { proRataPct: uc.proRataPct } : {}),
      ...(uc.grossUp != null ? { grossUp: uc.grossUp } : {}),
    };
  }

  const config = mergeConfig(seededWithUnit, await getOverrides(property, year));
  const resets = { ...reconYear.resets, ...(await loadResets()) };
  const snowExclusions = await loadSnowExclusions();
  const tenants = assembleTenantInputs(reconYear.roster, year, config, resets, snowExclusions);

  const JV_III = new Set(["3610", "3620", "3640"]);
  const pool = JV_III.has(property)
    ? fixture.pool
    : { ...fixture.pool, opexLines: fixture.pool.opexLines.filter((l) => !l.glAccount.startsWith("6990")) };

  // From 2026 on, the FINAL overrides drive the recon; earlier years use the
  // seeded expense-history pool directly.
  let finals: Record<string, number> | undefined;
  if (year >= ADJUSTMENTS_FROM_YEAR) {
    const summary = mergeExpenseSummary(property, year, await getExpenseOverrides(property, year))
      .filter((r) => r.account !== "6990-8502" || JV_III.has(property));
    finals = summary.length ? finalsFromSummary(summary) : undefined;
  }

  const result = reconcileBuilding(pool, tenants, year, finals);
  return { result };
}
