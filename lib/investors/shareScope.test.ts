import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(process.cwd(), "app/api/investor-k1/share/route.ts"), "utf8");
const card = readFileSync(join(process.cwd(), "app/components/ShareLinkCard.tsx"), "utf8");
const hook = readFileSync(join(process.cwd(), "app/investors/useK1.ts"), "utf8");

/**
 * A send releases the WHOLE PERSON, not the partnership it was sent from.
 *
 * Scoped to one partnership, an investor in fifteen of them opened their link
 * and saw the single K-1 that happened to be sent last — the other fourteen
 * uploaded, covered by the link, and invisible. That is the one-link promise
 * broken exactly where it is felt.
 */
describe("a K-1 send releases every K-1 the investor holds that year", () => {
  it("publishes over the person's whole group, not one property's owners", () => {
    expect(route).toContain("group.map((o) => k1sForOwner(o.id))");
    // The old narrowing — owners filtered down to the property sent from.
    expect(route).not.toContain("const inScope = new Set(");
  });

  it("the PREVIEW uses the same scope as the send", () => {
    // A preview narrower than the send would understate what is about to
    // become readable, which is the one thing the confirm exists to prevent.
    expect(route.match(/group\.map\(\(o\) => k1sForOwner\(o\.id\)\)/g) ?? []).toHaveLength(2);
  });

  it("names what it releases, so widening is never silent", () => {
    expect(route).toContain("const releases =");
    expect(hook).toContain("releases: j.releases ?? []");
    expect(card).toContain("draft.releases");
    expect(card).toContain("readable on their link");
  });
});
