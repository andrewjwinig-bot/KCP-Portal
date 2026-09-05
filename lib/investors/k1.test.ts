import { describe, expect, it } from "vitest";
import { matchK1ToOwner, publishBlockers, signalTokens, type K1Document } from "./k1";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";
import { canEditOwnership, canManageK1 } from "@/lib/users";

const parkwood = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "7010")!.owners;
const owner = (id: string) => parkwood.find((o) => o.id === id)!;

describe("matchK1ToOwner — real Parkwood roster", () => {
  it("matches on vendor code, which is unique by construction", () => {
    const m = matchK1ToOwner("K-1 2025 AKGST.pdf", parkwood);
    expect(m).toMatchObject({ ownerId: "own-7010-akgst", confidence: "vendor-code" });
  });

  it("refuses to guess between two owners with the same name", () => {
    // Alison Korman Feldman holds BOTH a GST trust interest (4.95%) and a
    // personal one (1.62%). A filename with only her name cannot say which.
    const m = matchK1ToOwner("Parkwood 2025 K-1 - Alison Korman Feldman.pdf", parkwood);
    expect(m.ownerId).toBeNull();
    expect(m.confidence).toBe("ambiguous");
    expect(m.candidates.sort()).toEqual(["own-7010-akgst", "own-7010-alis1"]);
    expect(m.reason).toMatch(/can't tell them apart/);
  });

  it("separates the trust from the person when the trust name is present", () => {
    const m = matchK1ToOwner("LIK GST TR FBO Alison Feldman 2025.pdf", parkwood);
    expect(m).toMatchObject({ ownerId: "own-7010-akgst", confidence: "trust-name" });
  });

  it("matches a uniquely-named owner from the filename alone", () => {
    const m = matchK1ToOwner("K1_2025_Carolyn_Korman_Jacobs.pdf", parkwood);
    expect(m).toMatchObject({ ownerId: "own-7010-caro2", confidence: "name" });
  });

  it("makes no suggestion when nothing matches", () => {
    const m = matchK1ToOwner("scan0001.pdf", parkwood);
    expect(m).toMatchObject({ ownerId: null, confidence: "none" });
  });

  it("is not fooled by the property name in every filename", () => {
    // "Parkwood" is boilerplate. The family surname deliberately is NOT — most
    // owners here are Kormans and several aren't, so it carries real signal;
    // discarding it once made Lawrence M. Korman collide with Lawrence Isard.
    expect(signalTokens("Korman Parkwood Shopping Center 2025 K-1.pdf")).toEqual(["korman"]);
    // A surname alone still identifies nobody — every owner has a given name too.
    expect(matchK1ToOwner("Korman Parkwood Shopping Center 2025 K-1.pdf", parkwood).ownerId).toBeNull();
  });

  it("keeps the two Lawrences apart", () => {
    expect(matchK1ToOwner("2025 K-1 Lawrence Isard.pdf", parkwood).ownerId).toBe("own-7010-lawr2");
    expect(matchK1ToOwner("2025 K-1 Lawrence M Korman.pdf", parkwood).ownerId).toBe("own-7010-tru4");
  });

  it("every uniquely-named owner is reachable by name, and no shared name is", () => {
    const counts = new Map<string, number>();
    for (const o of parkwood) counts.set(o.name, (counts.get(o.name) ?? 0) + 1);
    for (const o of parkwood) {
      const m = matchK1ToOwner(`2025 K-1 ${o.name}.pdf`, parkwood);
      if (counts.get(o.name) === 1) expect(m.ownerId).toBe(o.id);
      else expect(m.confidence).toBe("ambiguous");
    }
  });
});

describe("publishBlockers", () => {
  const doc = (over: Partial<K1Document>): K1Document => ({
    id: "d1", propertyCode: "7010", taxYear: 2025, filename: "k1.pdf", size: 1, ref: "r", local: true,
    uploadedAt: "", uploadedBy: null, ownerId: "own-7010-akgst", ownerName: "Alison Korman Feldman",
    match: { ownerId: null, confidence: "none", candidates: [], reason: "" },
    status: "confirmed", confirmedAt: "", confirmedBy: "DREW",
    published: false, publishedAt: null, views: [], viewCount: 0, lastViewedAt: null, ...over,
  });

  it("passes when every file is confirmed against a distinct owner", () => {
    expect(publishBlockers([doc({}), doc({ id: "d2", ownerId: "own-7010-bert4", ownerName: "Berton E. Korman" })])).toEqual([]);
  });

  it("blocks on anything not confirmed by a person", () => {
    expect(publishBlockers([doc({ status: "suggested" })])[0]).toMatch(/not confirmed/);
    expect(publishBlockers([doc({ status: "unassigned", ownerId: null })])[0]).toMatch(/not confirmed/);
  });

  it("blocks when one owner would receive two K-1s", () => {
    const b = publishBlockers([doc({}), doc({ id: "d2" })]);
    expect(b.some((x) => /has 2 K-1s assigned/.test(x))).toBe(true);
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
