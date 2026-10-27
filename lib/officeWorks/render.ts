import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { HANDOFF_OFFICES, OFFICE_WORKS_CODE, officesFromRoll, sizeRange, type Office } from "./offices";

// The Office Works website (Claude Design handoff), served whole at
// /office-works: its own fonts, styles and script. The open offices and the
// size range are the 4900 rent roll's on every request (offices.ts).

export async function renderOfficeWorks(): Promise<string> {
  let offices: Office[] = HANDOFF_OFFICES;
  let range = "130–460";
  try {
    const roll = await resolveCurrentRentroll();
    const prop = roll?.properties.find((p) => p.propertyCode.toUpperCase() === OFFICE_WORKS_CODE);
    if (prop) {
      const units = prop.units ?? [];
      offices = officesFromRoll(units);
      range = sizeRange(units);
      console.log(`[office-works] rent roll: ${units.length} units, open: ${offices.map((o) => `${o.id} (${o.sf})`).join(", ") || "none"}`);
    } else {
      console.log("[office-works] no 4900 property on the rent roll — showing the design's offices");
    }
  } catch {
    // No roll reachable: the page renders as designed.
  }
  const template = await readFile(path.join(process.cwd(), "lib/officeWorks/office-works.html"), "utf8");
  // JSON is valid JS; escaping "<" keeps a value from closing the script.
  const json = JSON.stringify(offices).replace(/</g, "\\u003c");
  return template
    .replace("/*@OFFICES@*/[]", () => json)
    .replaceAll("{{OFFICE_RANGE}}", range);
}
