import { describe, it, expect } from "vitest";
import { PROPERTY_OWNERSHIP } from "./ownership";
import { PROPERTY_DEFS } from "./data";
import { ownerSections } from "@/app/investors/ownerSections";
import { coveredOwnerIds } from "@/lib/investors/linkCoverage";

/** HYMAN KORMAN COMPANY — the partnership itself, which files its own 1065. */
const hkc = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "HKCo")!;
/** The buildings HKC holds an interest IN, where it is a partner rather than
 *  the filer. */
const asPartner = PROPERTY_OWNERSHIP.filter((p) =>
  p.owners.some((o) => o.name === "Hyman Korman Co."));

describe("Hyman Korman Company (HKC) — the entity's own K-1 roster", () => {
  it("issues K-1s, and names itself because it is not a building", () => {
    expect(hkc.hasK1Distribution).toBe(true);
    expect(hkc.propertyName).toBe("Hyman Korman Company");
    // Like WHIT and 3600: files the return without being in the directory.
    expect(PROPERTY_DEFS.some((d) => d.id === "HKCo")).toBe(false);
  });

  it("has all 24 partners holding DIRECTLY — every row an upload target", () => {
    // The point of the entry. As sub-owners under 0800/3600/4000/4900 these
    // same people can take no upload, because their K-1 is issued by HKC and
    // not by the building. Here HKC IS the filer, so each row is a document.
    expect(hkc.owners.length).toBe(24);
    expect(hkc.owners.filter((o) => o.subOwners).length).toBe(0);
    // Ids keep the `k1-hkc-` prefix although the code reads HKCo — an id is an
    // upload target, and renaming one orphans the document attached to it.
    expect(hkc.owners.every((o) => o.id.startsWith("k1-hkc-"))).toBe(true);
    expect(new Set(hkc.owners.map((o) => o.id)).size).toBe(24);
  });

  it("is a flat list — no entity band, because no partner is a partnership", () => {
    // One unheaded section, the shape every all-individual roster takes. A
    // banded table would be wrong here: nobody sits behind these rows.
    const sections = ownerSections(hkc.owners);
    expect(sections.length).toBe(1);
    expect(sections[0].key).toBe("all");
    expect(sections[0].entity).toBeUndefined();
    expect(sections[0].owners.length).toBe(24);
  });

  it("totals the 99.9999% the schedule actually reads", () => {
    // Three-decimal rounding on the schedule, not a keying error — pinned so
    // nobody 'fixes' it into a plug.
    const total = hkc.owners.reduce((s, o) => s + o.ownerPct, 0);
    expect(total).toBeCloseTo(0.999999, 6);
  });

  it("is 16 people across 24 interests, and the repeats tell themselves apart", () => {
    // Several partners hold more than one interest (Joan Sohn holds four), and
    // each interest is a separate K-1 — so a shared name MUST carry a held-as
    // or two rows are indistinguishable on the roster.
    const names = hkc.owners.map((o) => o.name);
    expect(new Set(names).size).toBe(16);
    // At most ONE row per name may go without a held-as — the roster renders
    // that one "Held personally", which reads as a distinct interest. TWO such
    // rows for one person would be genuinely indistinguishable.
    //
    // Beyond that, no two of a person's rows may match on held-as AND
    // percentage: that pair is unresolvable on screen, and dropping a K-1 on
    // the wrong one of them is a mistake nobody would ever see.
    //
    // KNOWN, and deliberately not "fixed" here: Alison Korman Feldman's two
    // interests carry the SAME held-as at different rates (0.8668% and
    // 3.0385%), so percentage is all that tells them apart. Her 3.0385% row
    // sits in a group where Susan and Catherine are keyed "LIK SUBJECT FBO
    // …", which suggests hers should read that way too — but a trust name is
    // not something to infer, so it stays as the schedule was keyed until the
    // schedule says otherwise.
    for (const name of new Set(names)) {
      const rows = hkc.owners.filter((o) => o.name === name);
      if (rows.length < 2) continue;
      expect(rows.filter((o) => !o.detailedName).length, `${name}: two rows with no held-as`).toBeLessThanOrEqual(1);
      const fingerprint = rows.map((o) => `${o.detailedName ?? "personally"}@${o.ownerPct}`);
      expect(new Set(fingerprint).size, `${name}: two rows are indistinguishable`).toBe(rows.length);
    }
  });

  it("does NOT live on 5600 — that property issues no K-1s of its own", () => {
    // 5600 is wholly owned by HKC, and a partnership needs more than one
    // partner. Filing HKC's K-1s there would label 24 investors' tax documents
    // "Castor Ave - USPS".
    const p5600 = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "5600")!;
    expect(p5600.owners.length).toBe(1);
    expect(p5600.owners[0].name).toBe("Hyman Korman Co.");
    expect(p5600.hasK1Distribution).toBeFalsy();
  });

  it("keeps the sub-owner tiers intact — the roster is added, not moved", () => {
    // HKC is still a partner of the buildings it holds; promoting its partners
    // here must not strip the tier that shows who sits behind it there.
    expect(asPartner.map((p) => p.propertyCode).sort()).toEqual(["0800", "2300", "3600", "4000", "4900", "5600"]);
    // Where the tier is keyed it must still carry all 24, from the one shared
    // definition. 2300 and 5600 key HKC flat, from their own schedules — that
    // predates this entry and is left as their schedules read.
    const tiered = asPartner.filter((p) => p.owners.some((o) => o.name === "Hyman Korman Co." && o.subOwners?.length));
    expect(tiered.map((p) => p.propertyCode).sort()).toEqual(["0800", "3600", "4000", "4900"]);
    for (const p of tiered) {
      const row = p.owners.find((o) => o.name === "Hyman Korman Co.")!;
      expect(row.subOwners?.length).toBe(24);
    }
  });

  it("a partner's existing link widens to cover their new HKC interest", () => {
    // An investor already holding elsewhere must not end up with a second
    // link: coverage resolves through the PERSON at read time.
    const steven = hkc.owners.find((o) => o.name === "Steven H. Korman")!;
    const elsewhere = PROPERTY_OWNERSHIP
      .filter((p) => p.propertyCode !== "HKCo")
      .flatMap((p) => p.owners)
      .find((o) => o.name === "Steven H. Korman")!;
    const covered = coveredOwnerIds({ ownerId: elsewhere.id, ownerIds: [elsewhere.id], ownerName: "Steven H. Korman" });
    expect(covered).toContain(steven.id);
  });
});
