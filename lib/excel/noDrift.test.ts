import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { COLOR, FMT } from "./theme";

// The drift this file exists to stop is the one the UI keeps hitting: the next
// export is always one file away from re-typing the navy, and five of them had.
// A source scan is the only guardrail that catches it, because every one of
// those workbooks opened fine — they just didn't look like each other.
//
// Scope: files that BUILD a workbook. Parsers read someone else's file and are
// none of this file's business.

const ROOTS = ["lib", "app"];
const SKIP = /node_modules|\.next|\/excel\/theme|\.test\.|parse|Parser|glParser/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r)).map((path) => ({ path, src: readFileSync(path, "utf8") }));
const excelJsBuilders = files.filter((f) => /from ["']exceljs["']/.test(f.src));

describe("workbook theme", () => {
  it("finds the ExcelJS exports it is meant to cover", () => {
    // A guard that silently matches nothing is worse than no guard.
    expect(excelJsBuilders.length).toBeGreaterThanOrEqual(5);
  });

  it("builds every workbook through newWorkbook()", () => {
    // Not style: `newWorkbook` carries `fullCalcOnLoad`, without which a total
    // that nets to zero opens blank, and the one creator string.
    const raw = excelJsBuilders.filter((f) => /new ExcelJS\.Workbook\(/.test(f.src));
    expect(raw.map((f) => f.path)).toEqual([]);
  });

  it("re-types no brand colour inline", () => {
    const brandHexes = [COLOR.brand, COLOR.brandDark, COLOR.brandTint, COLOR.rollupTint, COLOR.border]
      .map((h) => h.replace(/^FF/, ""));
    const offenders = excelJsBuilders
      .map((f) => ({ path: f.path, hits: brandHexes.filter((h) => new RegExp(`["']FF${h}["']`, "i").test(f.src)) }))
      .filter((o) => o.hits.length);
    expect(offenders).toEqual([]);
  });

  it("re-types no money format inline", () => {
    // The accounting format is 40 characters of Excel punctuation. Re-typed, it
    // is re-typed slightly differently — which is how the TOP SHEET ended up
    // the one workbook not using it.
    const offenders = excelJsBuilders
      .filter((f) => f.src.includes(FMT.money) || f.src.includes(FMT.moneyCents))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
