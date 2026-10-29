import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { spacesFromRoll, totalSfFromRoll, DESIGN_TOTAL_SF, type InterplexSpace } from "./spaces";

// The Neshaminy Interplex Business Center website (Claude Design handoff),
// served whole at /site/office/neshaminy-interplex: its own fonts, styles and
// script. The Available Space table and the park's SF are the CURRENT RENT
// ROLL's on every request (spaces.ts); no roll reachable → no suites listed.

export async function renderInterplex(): Promise<string> {
  let spaces: InterplexSpace[] = [];
  let totalSf = DESIGN_TOTAL_SF;
  try {
    const roll = await resolveCurrentRentroll();
    if (roll) {
      spaces = spacesFromRoll(roll.properties);
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
    .replaceAll("{{TOTAL_SF_RAW}}", String(totalSf))
    .replaceAll("{{TOTAL_SF}}", totalSf.toLocaleString("en-US"));
}
