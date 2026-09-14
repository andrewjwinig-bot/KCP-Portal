import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const page = readFileSync(join(process.cwd(), "app/investors/page.tsx"), "utf8");

// A component that is written, typechecks, builds and is never RENDERED is
// invisible to every other kind of test here. K1Progress shipped that way: the
// progress pill existed, the summary that feeds it was being fetched, and the
// roster went on drawing the flat teal chip it was written to replace — so a
// partnership sitting on 12 of 21 K-1s still read as finished, and the change
// was reported as delivered.
describe("the K-1 pills are actually on the page", () => {
  it("the property roster renders the progress pill", () => {
    expect(page).toContain("<K1Progress");
  });

  it("By Investor renders the per-investor count", () => {
    expect(page).toContain("<K1InvestorCount");
  });

  it("the flat teal K-1 chip is gone", () => {
    // Teal reads as a tick. It said only that a property FILES K-1s, which is
    // true of every flagged partnership, so it could never mean "complete" and
    // always looked like it did.
    // Its border tone, which nothing else used. (The same teal at 0.06 is the
    // row highlight while a file is uploading — a different thing.)
    expect(page).not.toContain("rgba(15,118,110,0.25)");
  });

  it("green is defined in exactly one place", () => {
    // Two pills disagreeing about what green means is worse than either alone.
    expect(page.match(/rgba\(22,163,74,0\.10\)/g) ?? []).toHaveLength(1);
  });
});
