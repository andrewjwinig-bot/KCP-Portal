import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { K1Document } from "./k1";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const store = read("lib/investors/k1Store.ts");
const portal = read("app/api/investor/[token]/route.ts");
const file = read("app/api/investor/[token]/file/route.ts");
const zip = read("app/api/investor/[token]/all/route.ts");
const admin = read("app/api/investor-k1/route.ts");

const doc = (over: Partial<K1Document>): K1Document => ({
  id: "d", propertyCode: "7010", taxYear: 2025, filename: "k1.pdf", size: 1, ref: "r",
  local: false, uploadedAt: "", uploadedBy: null, ownerId: "o", ownerName: "n",
  published: false, publishedAt: null, views: [], viewCount: 0, lastViewedAt: null, ...over,
});

/**
 * An investor sees what has been UPLOADED onto them, not what has been sent.
 *
 * Catherine Altman held eleven interests, opened her link, and saw the one
 * K-1 from Grays Ferry — the other ten uploaded, covered by her link, and
 * invisible, with nothing on the page saying they existed.
 */
describe("visibility is uploaded-unless-withheld", () => {
  it("an uploaded, unsent K-1 is visible", () => {
    const d = doc({ published: false });
    expect(!d.withheld).toBe(true);
  });

  it("a withheld K-1 is not, however it was published", () => {
    expect(!doc({ published: true, withheld: true }).withheld).toBe(false);
  });

  it("existing documents need no migration — the flag is the EXCEPTION", () => {
    // Every K-1 already in storage predates `withheld`, so it is absent on all
    // of them. Had visibility been written as `visible === true` instead, the
    // whole store would have gone dark on deploy.
    expect(doc({}).withheld).toBeUndefined();
    expect(store).toContain("!d.withheld");
  });

  it("every investor-facing route reads the same rule", () => {
    // A list route and a file route that disagree means an investor sees a
    // K-1 on their page and gets a 404 when they click it.
    expect(portal).toContain("visibleK1sForOwner");
    expect(zip).toContain("visibleK1sForOwner");
    expect(file).toContain("doc.withheld");
    expect(portal).not.toContain("publishedK1sForOwner");
    expect(file).not.toContain("!doc.published");
  });

  it("unpublish still retracts — it sets withheld, not just published", () => {
    // `published` now only records that a send happened, so unpublish would
    // otherwise have been a retraction button that retracted nothing.
    expect(admin).toContain('d.withheld = action !== "publish"');
  });

  it("an upload is not marked as SENT", () => {
    // The roster pill and the tax tracker both mean "a send happened" by
    // published; an upload must not tick either.
    expect(admin).toContain("published: false, publishedAt: null, withheld: false,");
  });
});
