import "server-only";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { RETAIL_RECON_FIXTURES } from "@/lib/cam/retail/registry";
import { normName, type CenterProfile, type Kv, type MarketedSpace } from "./registry";

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

/** Public display name (prettified) for a rent-roll tenant name. */
function displayFor(profile: CenterProfile, name: string): string {
  return lookupByName(profile.displayNames, name) ?? name;
}

async function occupiedFromLive(profile: CenterProfile): Promise<CenterTenant[] | null> {
  try {
    const rr = await resolveCurrentRentroll();
    if (!rr) return null;
    const prop = rr.properties.find(
      (p) => p.propertyCode.toUpperCase() === profile.code.toUpperCase(),
    );
    if (!prop || !prop.units.length) return null;
    const tenants = prop.units
      .filter((u) => !u.isVacant && !u.amenity && u.occupantName && u.sqft > 0)
      .map((u) => ({ name: displayFor(profile, u.occupantName), cat: categoryFor(profile, u.occupantName), sf: Math.round(u.sqft) }));
    return tenants.length ? tenants : null;
  } catch {
    return null;
  }
}

function occupiedFromSeed(profile: CenterProfile): CenterTenant[] {
  const fix = RETAIL_RECON_FIXTURES[profile.code];
  if (!fix) return [];
  const years = Object.keys(fix.byYear).map(Number);
  if (!years.length) return [];
  const roster = fix.byYear[Math.max(...years)]?.roster ?? [];
  return roster
    .filter((r) => !r.vacant && r.sqft > 0 && normName(r.name) !== "vacant")
    .map((r) => ({ name: displayFor(profile, r.name), cat: categoryFor(profile, r.name), sf: r.sqft }));
}

export async function getCenterData(profile: CenterProfile): Promise<CenterData> {
  const live = await occupiedFromLive(profile);
  const source: "live" | "seed" = live ? "live" : "seed";
  const tenants = (live ?? occupiedFromSeed(profile)).slice().sort((a, b) => b.sf - a.sf);

  const vacancies = profile.marketedSpaces;
  const availTotal = vacancies.reduce((s, v) => s + v.sf, 0);
  const gla = profile.gla || tenants.reduce((s, t) => s + t.sf, 0) + availTotal;
  const occupancyPct = gla > 0 ? Math.round((1 - availTotal / gla) * 100) : 100;

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
  };
}
