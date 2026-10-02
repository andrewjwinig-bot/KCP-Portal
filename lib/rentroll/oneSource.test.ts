import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

// ONE SOURCE FOR THE RENT ROLL. The stored "rentroll/current" pointer is a
// COPY, only rewritten when someone opens the Rent Roll page — so a reader of
// it can carry figures the Rent Roll page no longer shows. 1100's Ferry Good
// Treats read $2,000 on the Rent Roll page and $0 on the operating statement,
// which then called a correctly billed charge "UNEXPECTED $2,000".
//
// Read the roll through `resolveCurrentRentroll` / `composeCurrentRoll` /
// `rollAsOf` in lib/rentroll/current.ts. Only these files may touch the
// pointer, each as a fallback for when no history exists yet.
const ALLOWED = new Set([
  "app/api/rentroll/route.ts",             // writes it (import + self-heal)
  "app/api/rentroll/history/route.ts",     // backfills history from it when empty
  "app/api/rentroll/trends/export/route.ts",
  "lib/rentroll/current.ts",
  "lib/financials/operating-statements/rentCheckRun.ts",
  "lib/reports/monthly.ts",
]);

const ROOT = path.resolve(__dirname, "../..");
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("the rent roll has one source", () => {
  it("nothing outside the allow-list reads the stored pointer", () => {
    const offenders = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "lib"))]
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => {
        const src = readFileSync(path.join(ROOT, rel), "utf-8");
        return /getJSON\(\s*"rentroll"\s*,\s*"current"\s*\)|getJSON\(\s*RENTROLL_PREFIX\s*,\s*RENTROLL_ID\s*\)/.test(src);
      });
    expect(offenders).toEqual([]);
  });
});
