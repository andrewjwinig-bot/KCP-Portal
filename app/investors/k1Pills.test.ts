import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Comments stripped — these assertions are about what the page RENDERS, and a
// comment explaining what was removed necessarily names the removed thing.
const page = readFileSync(join(process.cwd(), "app/investors/page.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

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

  it("Statement of Values is reached from an SOV column, and opens in the row", () => {
    // It was a labelled button in a column of its own — a near-empty strip
    // down the whole table. Now it is one icon, and the statement itself
    // renders inside that investor's row rather than on a third tab.
    expect(page).toContain("SOV<\/th>");
    expect(page).toContain("goToOwnerStatement(agg.name, agg.key)");
    expect(page).toContain("beneficiary === sovName");
  });

  it("there is no third tab — two views, both absorbing a half", () => {
    expect(page).toContain('type View = "property" | "investor"');
    expect(page).not.toContain('label: "Statement of Values"');
  });
});


const share2 = readFileSync(join(process.cwd(), "app/components/ShareLinkCard.tsx"), "utf8");
const taxDocs = readFileSync(join(process.cwd(), "app/components/PartnershipTaxDocs.tsx"), "utf8");

describe("the share dialog says it with buttons, not paragraphs", () => {
  it("no empty-state box announcing that no link exists", () => {
    // It sat directly above three buttons that say it: Email the investor,
    // Just create the link, See their page first.
    expect(share2).not.toContain("No link yet");
  });

  it("no sentence about a PIN that is not optional", () => {
    expect(share2).not.toContain("This link always carries an access PIN");
  });

  it("the send button names the recipient", () => {
    expect(page.includes("Email ${addressAs") || readFileSync(join(process.cwd(), "app/investors/K1Panel.tsx"), "utf8").includes("Email ${addressAs")).toBe(true);
  });
});

describe("partnership tax documents sit open at the bottom", () => {
  it("can render without a fold", () => {
    expect(taxDocs).toContain("collapsible");
  });

  it("carries no paragraph restating who they are for", () => {
    // "Not circulated to investors" beside the title already says it.
    expect(taxDocs).not.toContain("The rest of the return that arrives");
    expect(taxDocs).toContain("Not circulated to investors");
  });
});

describe("the ownership tables", () => {
  it("hide the vendor code column without disturbing the colSpans", () => {
    expect(page).toContain("VENDOR_COL");
    // Still searchable — the column is hidden, not the data dropped.
    expect(page).toContain("vendorCode ?? \"\").toLowerCase().includes(q)");
  });

  it("keep OWNERSHIP % on one line", () => {
    const heads = page.match(/<th[^>]*>OWNERSHIP %<\/th>/g) ?? [];
    expect(heads.length).toBeGreaterThan(0);
    for (const h of heads) expect(h, h).toContain("nowrap");
  });
});
