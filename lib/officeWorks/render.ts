import "server-only";
import { readFile } from "fs/promises";
import { OFFICE_WORKS_ORIGIN, designedHead, organizationLd, placeLd, withDesignedHead } from "@/lib/site/seo";
import path from "path";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { OFFICE_WORKS_CODE, planFromRoll, planSizeRange, type PlanOffice } from "./offices";

// The Office Works website (Claude Design handoff), served whole at
// /office-works: its own fonts, styles and script. The interactive floor
// plan's open offices and the size range are the 4900 rent roll's on every
// request (planFromRoll in offices.ts).

export async function renderOfficeWorks(): Promise<string> {
  let units: Parameters<typeof planFromRoll>[0] = null;
  try {
    const roll = await resolveCurrentRentroll();
    const prop = roll?.properties.find((p) => p.propertyCode.toUpperCase() === OFFICE_WORKS_CODE);
    if (prop) {
      units = prop.units ?? [];
    } else {
      console.log("[office-works] no 4900 property on the rent roll — showing the design's offices");
    }
  } catch {
    // No roll reachable: the page renders as designed.
  }
  const offices: PlanOffice[] = planFromRoll(units);
  const range = planSizeRange(offices);
  if (units) console.log(`[office-works] rent roll: ${units.length} units, open on the plan: ${offices.filter((o) => o.av).map((o) => `${o.id} (${o.sf})`).join(", ") || "none"}`);
  const template = await readFile(path.join(process.cwd(), "lib/officeWorks/office-works.html"), "utf8");
  // JSON is valid JS; escaping "<" keeps a value from closing the script.
  const json = JSON.stringify(offices).replace(/</g, "\\u003c");
  const open = offices.filter((o) => o.av).length;
  // Search (lib/site/seo.ts): canonical on theofficeworks.com, share card, JSON-LD.
  const description = `Furnished private offices (${range} SF), virtual offices and meeting rooms by the hour at Neshaminy Interplex, Trevose, Bucks County, PA. ${open ? `${open} ${open === 1 ? "office" : "offices"} open now.` : "Join the waitlist."} Reception, internet and coffee included.`;
  const head = designedHead({
    title: "The Office Works — Private Offices & Coworking in Trevose, PA",
    description, canonical: `${OFFICE_WORKS_ORIGIN}/`, siteName: "The Office Works",
    image: "/office-works/assets/p-lounge.jpg",
    jsonLd: [placeLd({ name: "The Office Works", url: `${OFFICE_WORKS_ORIGIN}/`, description, type: "LocalBusiness", street: "5 Neshaminy Interplex", city: "Trevose", region: "PA", zip: "19053", email: "nfox@kormancommercial.com" }), organizationLd()],
  });
  return withDesignedHead(template, head, "The Office Works — Private Offices & Coworking in Trevose, PA")
    .replace("/*@OFFICES@*/[]", () => json)
    .replaceAll("{{OFFICE_RANGE}}", range);
}
