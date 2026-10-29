import "server-only";
import { readFile } from "fs/promises";
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
  return template
    .replace("/*@OFFICES@*/[]", () => json)
    .replaceAll("{{OFFICE_RANGE}}", range);
}
