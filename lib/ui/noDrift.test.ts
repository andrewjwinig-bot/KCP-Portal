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

// THE RATCHET. The rest of the old styling is still being swept page by page,
// so these can't be zero yet — but they may never go UP. A new page that
// reaches for an emoji tick, a text arrow, a hand-typed colour or a tinted
// box fails here. When a sweep removes some, LOWER the number in the same
// change so the gain is locked in.
const RATCHET: { name: string; re: RegExp; max: number; fix: string }[] = [
  { name: "emoji / glyph ticks", re: /✅|⚠️|⚠|🕗|📄|✓|✔|✕|×/g, max: 112, fix: "Lucide CircleCheck / TriangleAlert / X" },
  { name: "text arrows", re: /→|←|▾|▸|▼|▶/g, max: 209, fix: "Lucide ChevronRight / ChevronDown, or .text-link" },
  { name: "inline hex colours", re: /"#[0-9a-fA-F]{6}"/g, max: 189, fix: "var(--brand) / var(--muted) / a tone in Pill.tsx" },
  { name: "tinted rgba fills", re: /background: "rgba\(/g, max: 126, fix: "a hairline row with the status in words" },
];

describe("UI drift ratchet", () => {
  const srcs = walk("app").map((path) => readFileSync(path, "utf8"));
  for (const r of RATCHET) {
    it(`${r.name} do not increase (max ${r.max})`, () => {
      const n = srcs.reduce((sum, src) => sum + (src.match(r.re)?.length ?? 0), 0);
      expect(n, `${r.name}: ${n} > ${r.max}. Use ${r.fix} instead (or lower the max if you removed some).`).toBeLessThanOrEqual(r.max);
    });
  }
});
