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

// An entity partner is TWO facts: its own share of the property, and the
// people behind it. By Property has shown both since the tiered rosters went
// in — a band with an "N INVESTORS" pill that opens to each investor's
// effective % and value. By Investor showed the entity as a plain row and
// nothing underneath, so the same company read as a person on one tab and a
// company on the other.
describe("an entity reads the same on both tabs", () => {
  it("By Investor names the investor count on the entity's own row", () => {
    expect(page).toContain("INVESTORS</span>");
    expect(page).toContain("entityInvestorCount");
  });

  it("and expands to the tier beneath it", () => {
    expect(page).toContain("investors in {r.investor.name}");
  });

  it("the entity count is the largest roster, never a sum across properties", () => {
    // Hyman Korman Co. has the same 24 shareholders whether you reach it from
    // 0800 or 4900. Summing would report 96.
    expect(page).toContain("Math.max(n, (r.investor.subOwners ?? []).length)");
  });

  it("a sub-owner's figures are their share OF THE ENTITY, times the entity's", () => {
    // Their stored percentage is a share of the company, not of the property.
    // Rendering it raw overstates a 5% shareholder of an 80% partner as 5% of
    // the building.
    expect(page).toContain("(ownershipFor(sub) ?? 0) * (ifrac ?? 0)");
  });
});
