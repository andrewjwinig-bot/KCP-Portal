import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { MarketedSpace } from "./registry";

// Staff-managed overrides for the public shopping-center pages — the things the
// rent roll does NOT carry: uploaded photos, the site-plan drawing, the
// marketed availabilities, and per-tenant DBA display names. Edited from the
// "Public website" card on the property detail page (/api/centers/[code]),
// stored one blob per property code. The public page merges these on top of
// the code defaults in registry.ts, so an edit shows up live (the save also
// revalidates the page).
//
// Mirrors the per-property store pattern used across CAM recon
// (poolStore / finalStore).

export type CenterAssets = {
  hero?: string;
  sitePlan?: string;
  /** Neighborhood photo URLs, positional to registry.neighborhood cards. */
  neighborhood?: string[];
};

/** Marketing copy for one available space, keyed by suite. Suite + SF + the
 *  count of spaces come LIVE from the rent roll's vacant units; staff only fill
 *  in these three description fields. Keyed by normName(suite). */
export type AvailDesc = { kind: string; frontage: string; notes: string };

export type CenterOverride = {
  assets?: CenterAssets;
  /** Legacy / fallback: manually-managed availabilities, used only when there
   *  is no live rent roll to derive vacancies from. */
  availabilities?: MarketedSpace[];
  /** Marketing descriptions for the rent-roll-derived vacant spaces, keyed by
   *  normName(suite). The suite/SF themselves always come from the rent roll. */
  availDesc?: Record<string, AvailDesc>;
  /** DBA display names keyed by a normalized rent-roll tenant name.
   *  Resolution precedence for a tenant's PUBLIC name:
   *    lease abstract (future) → this admin override → registry.displayNames
   *    → the raw rent-roll name.
   *  Once lease abstracts exist, a higher-precedence source slots in above
   *  this map with no change to the merge below. */
  dba?: Record<string, string>;
};

const PREFIX = "centers-config";

export async function getCenterOverride(code: string): Promise<CenterOverride> {
  const v = (await getJSON(PREFIX, code)) as CenterOverride | null;
  return v ?? {};
}

export async function saveCenterOverride(code: string, next: CenterOverride): Promise<CenterOverride> {
  const clean: CenterOverride = {
    assets: {
      hero: next.assets?.hero || undefined,
      sitePlan: next.assets?.sitePlan || undefined,
      neighborhood: Array.isArray(next.assets?.neighborhood) ? next.assets!.neighborhood : undefined,
    },
    availabilities: Array.isArray(next.availabilities) ? next.availabilities : [],
    availDesc: next.availDesc && typeof next.availDesc === "object" ? next.availDesc : {},
    dba: next.dba && typeof next.dba === "object" ? next.dba : {},
  };
  await storeJSON(PREFIX, code, clean);
  return clean;
}
