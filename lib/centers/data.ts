import "server-only";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { RETAIL_RECON_FIXTURES } from "@/lib/cam/retail/registry";
import { centerImageSrc, normName, type CenterProfile, type Kv, type MarketedSpace, type NeighborhoodCard } from "./registry";
import { getCenterOverride } from "./store";

// Join the leasing profile (marketing copy, categories, availabilities) to the
// LIVE tenant roster. Occupied tenants + their SF come from the rent roll; if
// the live feed is unavailable, fall back to the retail reconciliation seed
// roster (always present in-repo). Vacancies flagged in the rent roll are
// merged with the leasing-managed marketed spaces.

export type CenterTenant = { name: string; cat: string; sf: number };
export type CenterVacancy = MarketedSpace;

export type CenterData = {
  profile: CenterProfile;
  source: "live" | "seed";
  tenants: CenterTenant[];       // occupied, SF-desc (anchor first)
  vacancies: CenterVacancy[];
  availTotal: number;
  occupancyPct: number;
  specs: Kv[];                   // right column of the Overview
  facts: Kv[];                   // the facts strip
  spaceOptions: string[];        // inquiry-form <select> options
  assets: { hero?: string; sitePlan?: string };  // merged (override → registry)
  neighborhood: NeighborhoodCard[];              // photos merged from override
};

const fmt = (n: number) => n.toLocaleString("en-US");

/** Resolve a value from a normalized-name map, exact then loose contains. */
function lookupByName(map: Record<string, string> | undefined, name: string): string | undefined {
  if (!map) return undefined;
  const key = normName(name);
  if (map[key]) return map[key];
  for (const [k, v] of Object.entries(map)) {
    if (k && (key.includes(k) || k.includes(key))) return v;
  }
  return undefined;
}

function categoryFor(profile: CenterProfile, name: string): string {
  return lookupByName(profile.categories, name) ?? "";
}

/** Public display name (DBA) for a rent-roll tenant name, using the merged
 *  display-name map (override.dba over registry.displayNames). */
function displayWith(dnames: Record<string, string>, name: string): string {
  return lookupByName(dnames, name) ?? name;
}

/** Live occupied roster + the property's SF tallies from the rent roll. The SF
 *  totals are the SAME numbers the internal portal divides for occupancy
 *  (occupiedSqft / totalSqft in PortfolioOccupancyPanel / PropertyDetail), so
 *  the public page's occupancy stays in sync with the portal. */
type LiveVacant = { suite: string; sf: number };
type LiveRoster = { tenants: CenterTenant[]; occupiedSqft: number; totalSqft: number; vacants: LiveVacant[] };

async function occupiedFromLive(profile: CenterProfile, dnames: Record<string, string>): Promise<LiveRoster | null> {
  try {
    const rr = await resolveCurrentRentroll();
    if (!rr) return null;
    const prop = rr.properties.find(
      (p) => p.propertyCode.toUpperCase() === profile.code.toUpperCase(),
    );
    if (!prop || !prop.units.length) return null;
    const tenants = prop.units
      .filter((u) => !u.isVacant && !u.amenity && u.occupantName && u.sqft > 0)
      .map((u) => ({ name: displayWith(dnames, u.occupantName), cat: categoryFor(profile, u.occupantName), sf: Math.round(u.sqft) }));
    // Available spaces come LIVE from the rent roll's vacant units (suite +
    // SF); marketing copy is layered on separately from the admin override.
    const vacants: LiveVacant[] = prop.units
      .filter((u) => u.isVacant && !u.amenity && u.sqft > 0)
      .map((u) => ({ suite: u.unitRef, sf: Math.round(u.sqft) }));
    return tenants.length || vacants.length
      ? { tenants, occupiedSqft: prop.occupiedSqft, totalSqft: prop.totalSqft, vacants }
      : null;
  } catch {
    return null;
  }
}

function occupiedFromSeed(profile: CenterProfile, dnames: Record<string, string>): CenterTenant[] {
  const fix = RETAIL_RECON_FIXTURES[profile.code];
  if (!fix) return [];
  const years = Object.keys(fix.byYear).map(Number);
  if (!years.length) return [];
  const roster = fix.byYear[Math.max(...years)]?.roster ?? [];
  return roster
    .filter((r) => !r.vacant && r.sqft > 0 && normName(r.name) !== "vacant")
    .map((r) => ({ name: displayWith(dnames, r.name), cat: categoryFor(profile, r.name), sf: r.sqft }));
}

export async function getCenterData(profile: CenterProfile): Promise<CenterData> {
  const override = await getCenterOverride(profile.code);
  const dnames: Record<string, string> = { ...(profile.displayNames ?? {}), ...(override.dba ?? {}) };

  const live = await occupiedFromLive(profile, dnames);
  const source: "live" | "seed" = live ? "live" : "seed";
  const tenants = (live?.tenants ?? occupiedFromSeed(profile, dnames)).slice().sort((a, b) => b.sf - a.sf);

  // Available spaces: when the live rent roll is present, the list of vacancies
  // (suite + SF + count) comes straight from it — staff only supply the
  // marketing copy (kind / frontage / notes), merged in by suite. Without a
  // live roll, fall back to the manually-managed availabilities / defaults.
  const availDesc = override.availDesc ?? {};
  const vacancies: CenterVacancy[] = live
    ? live.vacants.map((v) => {
        const d = availDesc[normName(v.suite)];
        return { suite: v.suite, sf: v.sf, kind: d?.kind ?? "", frontage: d?.frontage ?? "", notes: d?.notes ?? "" };
      })
    : override.availabilities && override.availabilities.length
      ? override.availabilities
      : profile.marketedSpaces;

  const assets = {
    hero: centerImageSrc(override.assets?.hero ?? profile.assets.hero),
    sitePlan: centerImageSrc(override.assets?.sitePlan ?? profile.assets.sitePlan),
  };
  const neighborhood: NeighborhoodCard[] = profile.neighborhood.map((card, i) => ({
    ...card,
    photo: centerImageSrc(override.assets?.neighborhood?.[i] ?? card.photo) ?? card.photo,
  }));
  const availTotal = vacancies.reduce((s, v) => s + v.sf, 0);
  const gla = profile.gla || tenants.reduce((s, t) => s + t.sf, 0) + availTotal;
  // Occupancy mirrors the internal portal: when the live rent roll is
  // available, use occupiedSqft / totalSqft (identical to PortfolioOccupancyPanel
  // / PropertyDetail) so the public page never disagrees with the portal. Only
  // when there's no live feed do we fall back to the marketed-availability
  // estimate (1 − available SF / GLA).
  const occupancyPct =
    live && live.totalSqft > 0
      ? Math.round((live.occupiedSqft / live.totalSqft) * 100)
      : gla > 0
        ? Math.round((1 - availTotal / gla) * 100)
        : 100;

  const keyTenants =
    profile.keyTenants ||
    tenants.slice(0, 5).map((t) => t.name).join(", ");

  const specs: Kv[] = [
    { k: "Address", v: profile.addressLine },
    { k: "GLA", v: `${fmt(gla)} SF` },
    { k: "Key tenants", v: keyTenants },
    { k: "Parking", v: profile.parking },
  ];
  if (vacancies.length) {
    specs.push({ k: "Available", v: `${fmt(availTotal)} SF across ${vacancies.length} space${vacancies.length === 1 ? "" : "s"}` });
  }

  const facts: Kv[] = [
    { k: "Gross leasable area", v: `${fmt(gla)} SF` },
    { k: "Anchor", v: profile.anchorName || tenants[0]?.name || "—" },
    { k: "Occupancy", v: `${occupancyPct}%` },
    { k: "Surface parking", v: profile.parkingShort },
    ...profile.extraFacts,
  ];

  const spaceOptions = ["Which space?"]
    .concat(vacancies.map((v) => `${v.suite} — available`))
    .concat(["Multiple / not sure"]);

  return {
    profile,
    source,
    tenants,
    vacancies,
    availTotal,
    occupancyPct,
    specs,
    facts,
    spaceOptions,
    assets,
    neighborhood,
  };
}
