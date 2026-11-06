import { describe, it, expect } from "vitest";
import { PROPERTY_OWNERSHIP, getOwnersForProperty } from "./ownership";

describe("The Korman Co as a K-1 target", () => {
  const tkco = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "TKCO")!;

  it("is flagged as distributing, or it is invisible to the K-1 picker", () => {
    expect(tkco).toBeDefined();
    expect(tkco.hasK1Distribution).toBe(true);
  });

  it("carries the six members, totalling 100%", () => {
    const owners = getOwnersForProperty("TKCO");
    expect(owners).toHaveLength(6);
    const total = owners.reduce((s, o) => s + o.ownerPct, 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it("matches the K-1 schedule's percentages exactly", () => {
    const by = Object.fromEntries(getOwnersForProperty("TKCO").map((o) => [o.name, o.ownerPct]));
    expect(by["Steven H. Korman"]).toBe(0.333333);
    expect(by["Alison Korman Feldman"]).toBe(0.111111);
    expect(by["Catherine Korman Altman"]).toBe(0.111111);
    expect(by["Susan Korman Schurr"]).toBe(0.111112);
    expect(by["BEK 2012 LLC"]).toBe(0.231333);
    expect(by["The Berton E Korman Irrev TR Dtd 03031999"]).toBe(0.102000);
  });

  it("takes uploads DIRECTLY — none of the six is a sub-owner here", () => {
    // The whole reason this entry exists: a sub-owner's K-1 comes from the
    // entity above it, so a sub-owner row refuses an upload.
    for (const o of getOwnersForProperty("TKCO")) expect(o.subOwners).toBeUndefined();
  });

  it("uses ids unique to TKCo, so a document cannot land on a property's row", () => {
    const ids = getOwnersForProperty("TKCO").map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("own-tkco-")).toBe(true);
    const others = PROPERTY_OWNERSHIP.filter((p) => p.propertyCode !== "TKCO")
      .flatMap(function walk(p): string[] {
        const os = "owners" in p ? p.owners : [];
        return os.flatMap((o) => [o.id, ...(o.subOwners ?? []).flatMap((s) => [s.id, ...(s.subOwners ?? []).map((x) => x.id)])]);
      });
    for (const id of ids) expect(others).not.toContain(id);
  });

  it("names its people exactly as the other rosters do, so ONE link covers them", () => {
    // `personGroup` / `coveredOwnerIds` match by NAME across every roster. If
    // TKCo spelled a name differently, its K-1 would land outside the link the
    // investor already holds and they would never see it.
    const tkNames = new Set(getOwnersForProperty("TKCO").map((o) => o.name));
    const elsewhere = new Set(
      PROPERTY_OWNERSHIP.filter((p) => p.propertyCode !== "TKCO")
        .flatMap((p) => p.owners.flatMap((o) => [o.name, ...(o.subOwners ?? []).map((s) => s.name)]))
    );
    for (const n of ["Steven H. Korman", "Alison Korman Feldman", "Catherine Korman Altman", "Susan Korman Schurr", "BEK 2012 LLC"]) {
      expect(tkNames.has(n)).toBe(true);
      expect(elsewhere.has(n)).toBe(true);
    }
  });
});
