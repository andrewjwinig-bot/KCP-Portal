import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { getAllSuiteInformation } from "@/lib/suites/informationStorage";
import { sfHeadline, withFloorplans, spacesFromRoll, totalSfFromRoll, DESIGN_TOTAL_SF, type InterplexSpace } from "./spaces";

// The Neshaminy Interplex Business Center website (Claude Design handoff),
// served whole at /site/office/neshaminy-interplex: its own fonts, styles and
// script. The Available Space table (with each suite's unit-page floor plan)
// and the park's SF (rounded, "525K+") are the CURRENT RENT
// ROLL's on every request (spaces.ts); no roll reachable → no suites listed.

export async function renderInterplex(): Promise<string> {
  let spaces: InterplexSpace[] = [];
  let totalSf = DESIGN_TOTAL_SF;
  try {
    const roll = await resolveCurrentRentroll();
    if (roll) {
      spaces = spacesFromRoll(roll.properties);
      // Each suite's floor plan is the one uploaded on its unit page.
      const infos = await getAllSuiteInformation().catch(() => []);
      const plans = new Map(infos.filter((i) => i.floorplan).map((i) => [i.unitRef.toUpperCase(), i.floorplan!]));
      spaces = withFloorplans(spaces, plans);
      totalSf = totalSfFromRoll(roll.properties);
      console.log(`[interplex] rent roll: ${spaces.length} vacant suites — ${spaces.map((s) => `${s.bldg}/${s.suite} (${s.sf})`).join(", ") || "none"}`);
    }
  } catch {
    // No roll reachable: the page renders with no suites listed.
  }
  const template = await readFile(path.join(process.cwd(), "lib/interplex/interplex.html"), "utf8");
  // JSON is valid JS; escaping "<" keeps a value from closing the script.
  const json = JSON.stringify(spaces).replace(/</g, "\\u003c");
  return template
    .replace("/*@SPACES@*/[]", () => json)
    .replaceAll("{{TOTAL_SF}}", sfHeadline(totalSf));
}
