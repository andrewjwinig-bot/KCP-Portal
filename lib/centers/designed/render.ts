import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { centerBySlug, centerImageSrc, CENTER_PROFILES, type CenterProfile } from "../registry";
import { getCenterOverride } from "../store";
import { lookupByName } from "../data";
import { syncSuites, profilesNeeded, type DesignedSuite, type RollUnitLite, type TenantProfile } from "./sync";
import { getTenantProfiles } from "./profileStore";
import { LAFAYETTE_HILL_SUITES } from "./lafayetteHill";

// A center page built in Claude Design and handed off as one self-contained
// HTML file (lib/centers/designed/<slug>.html, assets under
// public/centers/<slug>/assets). It is served as-is — its own fonts, styles
// and script, none of the portal's — with its SUITES and the figures that
// depend on them filled in from the live rent roll on every request (sync.ts).

type Designed = { suites: DesignedSuite[]; fallbackGla: number };

const DESIGNED: Record<string, Designed> = {
  "lafayette-hill": { suites: LAFAYETTE_HILL_SUITES, fallbackGla: 18487 },
};

export const hasDesignedPage = (slug: string) => slug in DESIGNED;

const fmt = (n: number) => n.toLocaleString("en-US");

/** A designed center's live inputs: the roll's units for the property and
 *  the profiles Harry has entered (logos resolved for the public page). */
async function liveInputs(profile: CenterProfile): Promise<{ units: RollUnitLite[]; profiles: Record<string, TenantProfile> }> {
  let units: RollUnitLite[] = [];
  let profiles: Record<string, TenantProfile> = {};
  try {
    const [roll, stored] = await Promise.all([resolveCurrentRentroll(), getTenantProfiles(profile.code)]);
    const prop = roll?.properties.find((p) => p.propertyCode.toUpperCase() === profile.code.toUpperCase());
    units = (prop?.units ?? []).filter((u) => !u.amenity);
    profiles = Object.fromEntries(
      Object.entries(stored).map(([k, p]) => [k, { ...p, logo: p.logo ? centerImageSrc(p.logo) : undefined }]),
    );
  } catch {
    // No roll reachable: the page renders exactly as designed.
  }
  return { units, profiles };
}

export async function renderDesignedCenter(slug: string): Promise<string | null> {
  const designed = DESIGNED[slug];
  const profile = centerBySlug(slug);
  if (!designed || !profile) return null;
  const template = await readFile(path.join(process.cwd(), "lib/centers/designed", `${slug}.html`), "utf8");
  const { units, profiles } = await liveInputs(profile);
  const { suites, gla, changes } = syncSuites(designed.suites, units, profiles);
  if (changes.length) console.log(`[centers/${slug}] rent roll: ${changes.join("; ")}`);

  const available = suites.filter((s) => s.status === "available");
  const availSf = available.reduce((t, s) => t + s.sf, 0);
  const availDetail = available.length
    ? `${fmt(availSf)} SF · ${available.length === 1 ? "Suite" : "Suites"} ${available.map((s) => s.id).join(", ")}`
    : "Fully leased";
  // JSON is valid JS; escaping "<" keeps a tenant name from closing the script.
  const json = JSON.stringify(suites).replace(/</g, "\\u003c");
  return template
    .replace("/*@SUITES@*/[]", json)
    .replaceAll("{{GLA}}", fmt(gla ?? designed.fallbackGla))
    .replaceAll("{{AVAIL_SF}}", fmt(availSf))
    .replaceAll("{{AVAIL_DETAIL}}", availDetail);
}

export type ProfileRequest = {
  code: string; center: string; slug: string;
  suite: string; unitRef: string; occupant: string; sf: number;
  /** A public name already on file for this occupant (the centre's DBA map). */
  suggestedName?: string;
};

/** Every tenant on a designed page that nobody has described yet — what the
 *  dashboard asks Harry to fill in. */
export async function pendingTenantProfiles(): Promise<ProfileRequest[]> {
  const out: ProfileRequest[] = [];
  for (const [slug, designed] of Object.entries(DESIGNED)) {
    const profile = CENTER_PROFILES.find((p) => p.slug === slug);
    if (!profile) continue;
    const [{ units, profiles }, override] = await Promise.all([liveInputs(profile), getCenterOverride(profile.code)]);
    const dnames = { ...(profile.displayNames ?? {}), ...(override.dba ?? {}) };
    for (const n of profilesNeeded(designed.suites, units, profiles)) {
      out.push({
        code: profile.code, center: profile.name, slug, ...n,
        suggestedName: lookupByName(dnames, n.occupant),
      });
    }
  }
  return out;
}

export const designedSuiteExists = (code: string, suite: string) =>
  Object.entries(DESIGNED).some(([slug, d]) =>
    CENTER_PROFILES.find((p) => p.slug === slug)?.code.toUpperCase() === code.toUpperCase() && d.suites.some((s) => s.id === suite));
