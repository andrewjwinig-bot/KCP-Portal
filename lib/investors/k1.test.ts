import { describe, expect, it } from "vitest";
import { publishBlockers, type K1Document } from "./k1";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { canEditOwnership, canManageK1 } from "@/lib/users";

const parkwood = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "7010")!.owners;

describe("the Parkwood roster — why a K-1 is uploaded onto an owner", () => {
  it("has owners a name alone cannot tell apart", () => {
    // Alison Korman Feldman holds BOTH a GST trust interest and a personal one,
    // and she is not the only one. Nothing derived from a filename could route
    // these correctly, which is why the roster row is the assignment: you pick
    // the interest, and only "Held as" separates the two.
    const counts = new Map<string, number>();
    for (const o of parkwood) counts.set(o.name, (counts.get(o.name) ?? 0) + 1);
    const shared = [...counts.entries()].filter(([, n]) => n > 1);
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.map(([name]) => name)).toContain("Alison Korman Feldman");

    // Every duplicated name is separable on the page, or picking is guesswork.
    for (const [name] of shared) {
      const rows = parkwood.filter((o) => o.name === name);
      const marks = rows.map((o) => o.detailedName ?? o.vendorCode ?? "");
      expect(new Set(marks).size).toBe(rows.length);
    }
  });

  it("gives every owner a stable id to upload against", () => {
    expect(parkwood.length).toBeGreaterThan(0);
    expect(new Set(parkwood.map((o) => o.id)).size).toBe(parkwood.length);
    for (const o of parkwood) expect(o.id).toBeTruthy();
  });
});

describe("publishBlockers", () => {
  const doc = (over: Partial<K1Document>): K1Document => ({
    id: "d1", propertyCode: "7010", taxYear: 2025, filename: "k1.pdf", size: 1, ref: "r", local: true,
    uploadedAt: "", uploadedBy: "DREW", ownerId: "own-7010-akgst", ownerName: "Alison Korman Feldman",
    published: false, publishedAt: null, views: [], viewCount: 0, lastViewedAt: null, ...over,
  });

  it("passes when every file sits on a distinct owner", () => {
    expect(publishBlockers([doc({}), doc({ id: "d2", ownerId: "own-7010-bert4", ownerName: "Berton E. Korman" })])).toEqual([]);
  });

  it("blocks a file that lost its owner", () => {
    expect(publishBlockers([doc({ ownerId: "" })])[0]).toMatch(/not attached to an owner/);
  });

  it("blocks when one owner would receive two K-1s", () => {
    const b = publishBlockers([doc({}), doc({ id: "d2" })]);
    expect(b.some((x) => /has 2 K-1s/.test(x))).toBe(true);
  });

  it("does not confuse the two interests one person holds", () => {
    // Her trust K-1 and her personal K-1 are different documents for different
    // owner records — that is not a duplicate.
    expect(publishBlockers([
      doc({ id: "d1", ownerId: "own-7010-akgst" }),
      doc({ id: "d2", ownerId: "own-7010-alis1" }),
    ])).toEqual([]);
  });
});

describe("canManageK1", () => {
  it("is narrower than ownership editing — Alison is a Parkwood owner", () => {
    // She can edit the ownership table, but must never see co-owners' K-1s.
    expect(canEditOwnership("alison")).toBe(true);
    expect(canManageK1("alison")).toBe(false);
  });

  it("grants the people who run the distribution", () => {
    expect(canManageK1("drew")).toBe(true);
    expect(canManageK1("harry")).toBe(true);
    expect(canManageK1("admin")).toBe(true);
  });

  it("denies everyone else", () => {
    for (const u of ["marie", "nancy", "maint"] as const) expect(canManageK1(u)).toBe(false);
  });
});
