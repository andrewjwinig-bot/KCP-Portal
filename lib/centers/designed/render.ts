import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { centerBySlug, centerImageSrc, CENTER_PROFILES, type CenterProfile } from "../registry";
import { getCenterOverride, type AvailDesc } from "../store";
import { lookupByName } from "../data";
import { syncSuites, profilesNeeded, type DesignedSuite, type RollUnitLite, type TenantProfile } from "./sync";
import { getTenantProfiles } from "./profileStore";
import { LAFAYETTE_HILL_SUITES } from "./lafayetteHill";
import { BROOKWOOD_SUITES } from "./brookwood";
import { GRAYS_FERRY_SUITES } from "./graysFerry";
import { PARKWOOD_SUITES } from "./parkwood";
import { PARKWOOD_COMMONS_SUITES } from "./parkwoodCommons";
import { FLYERS, propertyFor, withAvailDesc } from "./flyer";

// A center page built in Claude Design and handed off as one self-contained
// HTML file (lib/centers/designed/<slug>.html, assets under
// public/centers/<slug>/assets). It is served as-is — its own fonts, styles
// and script, none of the portal's — with its SUITES and the figures that
// depend on them filled in from the live rent roll on every request (sync.ts).

type Designed = { suites: DesignedSuite[]; fallbackGla: number; /** Under public/centers/; defaults to the slug. */ assetDir?: string };

const DESIGNED: Record<string, Designed> = {
  "lafayette-hill": { suites: LAFAYETTE_HILL_SUITES, fallbackGla: 18487 },
  brookwood: { suites: BROOKWOOD_SUITES, fallbackGla: 61572 },
  "grays-ferry": { suites: GRAYS_FERRY_SUITES, fallbackGla: 82809 },
  parkwood: { suites: PARKWOOD_SUITES, fallbackGla: 61036 },
  // 1100 Parkwood Commons — the registry's slug; /centers/parkwood-commons serves it too.
  "parkwood-professional": { suites: PARKWOOD_COMMONS_SUITES, fallbackGla: 8287, assetDir: "parkwood-commons" },
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

/** The Available Space table + leasing flyer every designed page shares
 *  (shared/available.*), read once per instance. */
let _shared: Promise<{ css: string; html: string; js: string }> | null = null;
function sharedParts() {
  const dir = path.join(process.cwd(), "lib/centers/designed/shared");
  return (_shared ??= Promise.all(["available.css", "available.html", "available.js"].map((f) => readFile(path.join(dir, f), "utf8")))
    .then(([css, html, js]) => ({ css, html, js }))
    .catch((e) => { _shared = null; throw e; }));
}

/** A designed centre's suites as the public sees them right now: the design
 *  laid under the live rent roll (who, how big, what is vacant), Harry's tenant
 *  profiles, and the portal's per-suite availability copy. The ONE source for
 *  the centre page and the website's availability listings. */
export async function liveDesignedSuites(slug: string) {
  const designed = DESIGNED[slug];
  const profile = centerBySlug(slug);
  if (!designed || !profile) return null;
  const [{ units, profiles }, override] = await Promise.all([
    liveInputs(profile),
    getCenterOverride(profile.code).catch((): { availDesc?: Record<string, AvailDesc>; floorplans?: Record<string, string> } => ({})),
  ]);
  const floorplans = Object.fromEntries(Object.entries(override.floorplans ?? {}).map(([k, u]) => [k, centerImageSrc(u)]));
  const synced = syncSuites(designed.suites, units, profiles);
  if (synced.changes.length) console.log(`[centers/${slug}] rent roll: ${synced.changes.join("; ")}`);
  return {
    designed, profile,
    suites: withAvailDesc(synced.suites, override.availDesc ?? {}, profile.code, floorplans),
    gla: synced.gla ?? designed.fallbackGla,
  };
}

export async function renderDesignedCenter(slug: string): Promise<string | null> {
  const [live, shared] = await Promise.all([liveDesignedSuites(slug), sharedParts()]);
  if (!live) return null;
  const { designed, profile, suites, gla: glaNow } = live;
  const template = await readFile(path.join(process.cwd(), "lib/centers/designed", `${slug}.html`), "utf8");
  const flyer = FLYERS[slug];
  const property = flyer ? propertyFor(profile, flyer, suites, glaNow, `/centers/${designed.assetDir ?? slug}/assets`) : null;

  const available = suites.filter((s) => s.status === "available");
  const availSf = available.reduce((t, s) => t + s.sf, 0);
  const availDetail = available.length
    ? `${fmt(availSf)} SF · ${available.length === 1 ? "Suite" : "Suites"} ${available.map((s) => s.id).join(", ")}`
    : "Fully leased";
  // JSON is valid JS; escaping "<" keeps a tenant name from closing the script.
  const json = JSON.stringify(suites).replace(/</g, "\\u003c");
  const propJson = JSON.stringify(property ?? {}).replace(/</g, "\\u003c");
  return template
    .replace("/*@SUITES@*/[]", () => json)
    // The header logo goes back to the company website (/site works on
    // kormancommercial.com and on the portal host alike).
    .replace(/<img class="logo"[^>]*>/, (img) => `<a href="/site" aria-label="Korman Commercial Properties — home">${img}</a>`)
    .replace("/*@SHARED_CSS@*/", () => shared.css)
    .replace("<!--@AVAILABLE@-->", () => (property ? shared.html : ""))
    .replace("/*@SHARED_JS@*/", () => (property ? shared.js.replace("/*@PROPERTY@*/{}", () => propJson) : ""))
    .replaceAll("{{GLA}}", fmt(glaNow))
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
