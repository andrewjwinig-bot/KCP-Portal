import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { centerBySlug } from "../registry";
import { getCenterOverride } from "../store";
import { lookupByName } from "../data";
import { syncSuites, type DesignedSuite } from "./sync";
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

export async function renderDesignedCenter(slug: string): Promise<string | null> {
  const designed = DESIGNED[slug];
  const profile = centerBySlug(slug);
  if (!designed || !profile) return null;
  const template = await readFile(path.join(process.cwd(), "lib/centers/designed", `${slug}.html`), "utf8");

  let units: { unitRef: string; occupantName: string; isVacant: boolean; sqft: number }[] = [];
  let dnames: Record<string, string> = { ...(profile.displayNames ?? {}) };
  try {
    const [roll, override] = await Promise.all([resolveCurrentRentroll(), getCenterOverride(profile.code)]);
    dnames = { ...dnames, ...(override.dba ?? {}) };
    const prop = roll?.properties.find((p) => p.propertyCode.toUpperCase() === profile.code.toUpperCase());
    units = (prop?.units ?? []).filter((u) => !u.amenity);
  } catch {
    // No roll reachable: the page renders exactly as designed.
  }
  const { suites, gla, changes } = syncSuites(designed.suites, units, (n) => lookupByName(dnames, n) ?? n);
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
