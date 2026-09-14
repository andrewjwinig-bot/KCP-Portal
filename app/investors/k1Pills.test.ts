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

const share = readFileSync(join(process.cwd(), "app/components/ShareLinkCard.tsx"), "utf8");
const portal = readFileSync(join(process.cwd(), "app/investor/[token]/page.tsx"), "utf8");

describe("nothing has to be created before you can look", () => {
  it("the investor page can be previewed with no link yet", () => {
    // The preview mints nothing, publishes nothing and records no view, but it
    // only rendered beside an existing link — so checking what an investor
    // would see meant creating one first. The check exists to happen BEFORE
    // anything is created.
    const noLinkBranch = share.slice(share.indexOf("links.length === 0 && (onCreate || onSend)"));
    expect(noLinkBranch).toContain("viewAsHref");
  });
});

describe("an investor downloads everything at once", () => {
  it("the portal offers a zip of every K-1 on the link", () => {
    expect(portal).toContain(`/all`);
    expect(portal).toContain("Download all");
  });

  it("only when there is more than one — otherwise Download IS the button", () => {
    expect(portal).toContain("data.documents.length > 1");
  });
});

describe("By Investor shows where the K-1 link would go", () => {
  it("carries an Email column and a chase-list for the ones missing", () => {
    expect(page).toContain("<InvestorEmailCell");
    expect(page).toContain("missingEmailKeys");
    expect(page).toContain("with no email on file");
  });

  it("Statement of Values is on the opened row, not a column", () => {
    // As a column it was a near-empty strip down the whole table.
    expect(page).toContain("s Statement of Values &rarr;");
    expect(page).not.toContain("Statement of Values →\n");
  });
});

// Comments stripped: these assertions are about what the card RENDERS, and the
// comments explaining what was removed necessarily name the removed things.
const panel = readFileSync(join(process.cwd(), "app/investors/K1Panel.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// The card header restated what was already on screen. "K-1s uploaded" and
// "Still to collect" are the same number the collapsed roster row's pill
// carries; "Links shared" is the Portal column on every row. Three tiles of it
// cost a band of height on each open card and pushed the roster below the fold.
describe("the K-1 card header carries only what is not elsewhere", () => {
  it("has no KPI tiles", () => {
    expect(panel).not.toContain("<StatPill");
    expect(panel).not.toContain("K-1s uploaded");
    expect(panel).not.toContain("Still to collect");
  });

  it("has no fabricated-sample preview — the real one is per investor", () => {
    expect(panel).not.toContain("Preview investor view");
  });

  it("still carries the year and the bulk send", () => {
    expect(panel).toContain("<YearSelect");
    expect(panel).toContain("Email {chosen.length");
  });

  it("creating links without emailing is an ALTERNATIVE, never a step", () => {
    // The prerequisite is gone — Email mints the links on its way. This is the
    // other way out, and the only route that works for an investor with no
    // address on file.
    expect(panel).toContain("Create links, don");
    expect(panel).toContain("sends no email");
  });
});

// Chrome that told the reader nothing they could act on.
describe("the page doesn't explain itself to itself", () => {
  it("no source-code paths are shown to staff", () => {
    // "Source: lib/properties/ownership.ts" is a note to whoever maintains the
    // page, and it was the last line of every view.
    expect(page).not.toContain("lib/properties/ownership.ts");
    expect(page).not.toContain("lib/properties/entityValues.ts");
  });

  it("no subtitle counting the rows the table is about to show", () => {
    expect(page).not.toContain("unique investor");
    expect(page).not.toContain("Ownership detail across properties");
  });

  it("but the statement still states its BASIS", () => {
    // A value there is a share of an entity's equity at a fixed snapshot, not
    // a market quote — a real caveat for anyone quoting a figure.
    expect(page).toContain("effective % of the entity");
  });
});
