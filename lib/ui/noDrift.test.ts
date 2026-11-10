import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// The lock on the portal's one look (the UI twin of lib/excel/noDrift.test.ts).
//
// Small text on a page reads a type token (`fontSize: "var(--fs-12)"`), so the
// new look can hold a readable floor for everyone while the classic look keeps
// its exact sizes. A page that types a bare `fontSize: 11` quietly opts out of
// that floor — which is how the portal ended up with 2,000 tiny inline sizes —
// so this fails the build on the next one.

const SKIP = /node_modules|\.next|\.test\./;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

const SMALL_LITERAL = /fontSize:\s*(?:"(?:9|10|10\.5|11|11\.5|12|12\.5|13|13\.5|14)px"|(?:9|10|10\.5|11|11\.5|12|12\.5|13|13\.5|14))(?=\s*[,}\n])/g;

describe("UI drift", () => {
  it("small inline font sizes read the --fs-* tokens", () => {
    const offenders: string[] = [];
    for (const path of [...walk("app"), "app/components/tableStyles.ts"]) {
      const src = readFileSync(path, "utf8");
      const hits = src.match(SMALL_LITERAL);
      if (hits) offenders.push(`${path}: ${hits.length} (${hits[0]})`);
    }
    expect(offenders, `Use fontSize: "var(--fs-NN)" instead:\n${offenders.join("\n")}`).toEqual([]);
  });
});
