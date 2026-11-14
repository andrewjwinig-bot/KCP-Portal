import { describe, expect, it } from "vitest";
import { composeNotPostedDigest, type StagedNotPosted } from "./notPostedDigest";
import type { NotPostedItem } from "./notPosted";

const item = (p: Partial<NotPostedItem>): NotPostedItem => ({
  key: "x", propertyCode: "x", propertyName: "x", section: "Expenses", line: "Real Estate Taxes",
  type: "not-posted", expected: 1000, period: 10, monthLabel: "October", ...p,
});
const staged = (key: string, name: string, items: NotPostedItem[]): StagedNotPosted => ({
  id: key, key, propertyName: name, year: 2026, items, sig: key, importedBy: "drew", stagedAt: "2026-11-11T17:00:00Z",
});

describe("not-posted digest — one email for the whole import", () => {
  const entries = [
    staged("1100", "Parkwood Professional", [item({ expected: 1200 })]),
    staged("4500", "Gray's Ferry", [
      item({ line: "Insurance", expected: 900 }),
      item({ section: "Debt Service", line: "Interest", type: "missing-debt", expected: 30000 }),
    ]),
  ];
  const mail = composeNotPostedDigest(entries);

  it("counts every line across every property in the subject", () => {
    expect(mail.lines).toBe(3);
    expect(mail.subject).toBe("Not posted to the GL — 3 lines across 2 properties · October 2026");
  });

  it("lists every property, biggest dollars first, with the total", () => {
    expect(mail.html.indexOf("Gray's Ferry")).toBeLessThan(mail.html.indexOf("Parkwood Professional"));
    expect(mail.text).toContain("Expected, not yet posted: $32,100");
    expect(mail.html).toContain("Scheduled loan payment");
    expect(mail.text).toContain("imported by Drew");
    expect(mail.html).toContain("period=10");
  });

  it("names the one property when only one is staged", () => {
    expect(composeNotPostedDigest([entries[0]]).subject).toBe("Not posted to the GL — 1 line · Parkwood Professional · October 2026");
  });

  it("spans months when the batch does", () => {
    const m = composeNotPostedDigest([staged("1100", "A", [item({ period: 9, monthLabel: "September" }), item({ period: 10 })])]);
    expect(m.subject).toContain("September 2026 – October 2026");
  });
});
