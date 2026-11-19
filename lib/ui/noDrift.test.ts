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
  { name: "text arrows", re: /→|←|▾|▸|▼|▶/g, max: 206, fix: "Lucide ChevronRight / ChevronDown, or .text-link" },
  { name: "inline hex colours", re: /"#[0-9a-fA-F]{6}"/g, max: 189, fix: "var(--brand) / var(--muted) / a tone in Pill.tsx" },
  // A thick coloured bar down one side or across the top (owner: "i hate that
  // thicker line … when theres one thick line on the side i do not like it").
  // Left: the plan hover's colour rail and the reservation calendar's events.
  { name: "thick side / top rails", re: /border(Left|Top): ?["`][3-9]px/g, max: 2, fix: "the 1px border, an icon and the status in words" },
  { name: "tinted rgba fills", re: /background: "rgba\(/g, max: 125, fix: "a hairline row with the status in words" },
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

// THE STANDARD HEADER (owner, 11/2026: "i thought we are past me manually
// telling you to follow the standard formatting"). Four pages had kept a
// private copy of the header picker and drifted — "9510 — Name" here, "7010 ·
// Name" there, the year first on one, the pickers boxed in a card on another.
describe("page headers", () => {
  const files = walk("app");
  it("the header picker is the shared HeaderSelect — never a page's own copy", () => {
    const own = files.filter((p) => !p.endsWith("components/HeaderSelect.tsx") && /function HeaderSelect\s*\(/.test(readFileSync(p, "utf8")));
    expect(own, `Import HeaderSelect from app/components/HeaderSelect:\n${own.join("\n")}`).toEqual([]);
  });
  it("a page with header pickers draws them in PageHeader", () => {
    const off = files.filter((p) => { const s = readFileSync(p, "utf8"); return /<HeaderSelect\b/.test(s) && !/<PageHeader\b/.test(s); });
    expect(off, `Pass the pickers to PageHeader's \`pickers\`:\n${off.join("\n")}`).toEqual([]);
  });
  it("a property in a picker reads \"code · name\" (propertyLabel), never \"code — name\"", () => {
    const off = files.filter((p) => /<HeaderSelect\b[^>]*displayLabel=\{[^}]*`\$\{[^}]+\} — \$\{/.test(readFileSync(p, "utf8")));
    expect(off, `Use propertyLabel(code, name):\n${off.join("\n")}`).toEqual([]);
  });
  // Staff pages still hand-building a title (<h1> with no PageHeader). Being
  // swept; may only go DOWN — lower it when a page moves.
  it("hand-built page titles do not increase", () => {
    const PUBLIC = /app\/(site|portal|investor|centers|office-works|service|submit|reserve|login|budget-review|credit-apply|commissions-review|statement)\//;
    const n = files.filter((p) => !PUBLIC.test(p) && /<h1[\s>]/.test(readFileSync(p, "utf8")) && !/PageHeader/.test(readFileSync(p, "utf8"))).length;
    expect(n, `${n} pages hand-build a title — use PageHeader (or lower the max).`).toBeLessThanOrEqual(HAND_BUILT_TITLES_MAX);
  });
});
const HAND_BUILT_TITLES_MAX = 10;
