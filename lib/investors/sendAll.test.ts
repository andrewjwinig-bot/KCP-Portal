import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const page = read("app/investors/page.tsx");
const hook = read("app/investors/useK1.ts");
const route = read("app/api/investor-k1/share/route.ts");

/**
 * Emailing every investor at once is the largest blast radius in the app: one
 * click, forty-five irreversible sends, each releasing somebody's tax document.
 */
describe("email all investors", () => {
  it("goes through the SAME batch endpoint, not a second implementation", () => {
    // The checks that matter live in shareOne — prior link revoked, fresh PIN,
    // PIN as its own message, a LINK and never the K-1 attached. A second path
    // is how those drift.
    expect(hook).toContain('fetch("/api/investor-k1/share"');
    expect(hook).toContain("shareAll");
  });

  it("only offers investors who can actually receive one", () => {
    // No K-1 means nothing to release; no address means the send mints a link
    // and delivers nothing, which reads as success and is not.
    expect(page).toContain("sendableInvestors");
    expect(page).toContain("k1reg.k1Owners!.has(r.investor.id)");
    expect(page).toContain("if (!email) continue;");
  });

  it("confirms against a NAMED list, not just a count", () => {
    expect(page).toContain("i.name} — ${i.email}");
    expect(page).toContain("cannot be undone");
  });

  it("says how many it skipped for want of an address", () => {
    // Silently sending to 15 of 45 and reporting success is the failure this
    // prevents.
    expect(page).toContain("skipped, no email");
  });

  it("chunks under the server cap instead of up against it", () => {
    // 45 fit in one call today; 51 would fail the whole batch on the last one.
    expect(hook).toContain("const CHUNK = 40");
    expect(route).toContain("const MAX_BATCH = 50");
  });

  it("the batch spans partnerships — the server resolves each owner's own", () => {
    // A cross-partnership batch has no single propertyCode to pass, and the
    // email names the partnership, so taking it from the request would label
    // them all with one.
    expect(hook).toContain('propertyCode: ""');
    expect(route).toContain("const ownerProperty = found.code || propertyCode");
    expect(route).toContain("propertyName: propName(ownerProperty)");
  });
});
