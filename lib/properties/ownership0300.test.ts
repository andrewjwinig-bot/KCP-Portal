import { describe, it, expect } from "vitest";
import { PROPERTY_OWNERSHIP, type PropertyOwner } from "./ownership";
import { ownerSections } from "@/app/investors/ownerSections";

import { entityValue } from "./entityValues";

const p0300 = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "0300")!;
const p9200 = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "9200")!;
const byId = (id: string) => p0300.owners.find((o) => o.id === id)!;

describe("Airport Interplex Two (0300) — entities own it, investors sit beneath", () => {
  it("has THREE partners, and they are entities — not the people", () => {
    // The correction this entry exists for. Keyed flat at first, which read as
    // though each person were a direct partner of the property. None is: they
    // hold through three different companies at three different rates.
    expect(p0300.hasK1Distribution).toBe(true);
    expect(p0300.owners.map((o) => o.name)).toEqual([
      "Airport Interplex Two, Inc.",
      "The Korman Co",
      "New Eastwick Corporation",
    ]);
    expect(p0300.owners.map((o) => o.ownerPct)).toEqual([0.005, 0.745, 0.25]);
  });

  it("the three partners account for the whole property", () => {
    const total = p0300.owners.reduce((t, o) => t + (o.ownerPct ?? 0), 0);
    expect(Math.round(total * 1e6) / 1e6).toBe(1);
  });

  it("every partner collapses to its own investors", () => {
    for (const o of p0300.owners) expect(o.subOwners?.length, o.name).toBeGreaterThan(0);
    expect(byId("k1-0300-aitwo").subOwners).toHaveLength(5);
    expect(byId("k1-0300-kormanco").subOwners).toHaveLength(6);
    expect(byId("k1-0300-neweastwick").subOwners).toHaveLength(2);
  });

  it("renders as three bands, biggest first, with nothing loose", () => {
    // The screenshot's shape: an entity heads each band with its share of the
    // property and its investors beneath. No "Other investors" section here,
    // because no person holds the property directly.
    const secs = ownerSections(p0300.owners);
    expect(secs.map((s) => s.entity?.name)).toEqual([
      "The Korman Co",
      "New Eastwick Corporation",
      "Airport Interplex Two, Inc.",
    ]);
    expect(secs.some((s) => s.label === "Other investors")).toBe(false);
    expect(secs.map((s) => s.frac)).toEqual([0.745, 0.25, 0.005]);
  });

  it("a sub-owner's % is a share of ITS ENTITY, never of the property", () => {
    // The trap this modelling exists to avoid. Steven holds a third of The
    // Korman Co, which is 74.5% of the property — so 24.8% of it, not 33%.
    const steven = byId("k1-0300-kormanco").subOwners!.find((o) => o.name === "Steven H. Korman")!;
    expect(steven.ownerPct).toBeCloseTo(0.333333, 6);
    expect(steven.ownerPct! * byId("k1-0300-kormanco").ownerPct!).toBeCloseTo(0.248333, 6);
  });

  it("each entity's investors sum to its own 100%", () => {
    const sum = (o: PropertyOwner) => (o.subOwners ?? []).reduce((t, s) => t + (s.ownerPct ?? 0), 0);
    expect(Math.round(sum(byId("k1-0300-kormanco")) * 1e6) / 1e6).toBe(1);
    expect(Math.round(sum(byId("k1-0300-neweastwick")) * 1e6) / 1e6).toBe(1);
    // …except the Inc., whose schedule rounds to three decimals: two thirds
    // plus three ninths land on 99.990%. Keyed as the document reads.
    expect(Math.round(sum(byId("k1-0300-aitwo")) * 1e6) / 1e6).toBe(0.9999);
  });

  it("carries the third tier — The Korman Co inside New Eastwick", () => {
    // 9.6% of New Eastwick's 25% is another 2.4% of the property held by the
    // same company. Stored so the chain is complete even though the roster
    // draws two tiers.
    const ne = byId("k1-0300-neweastwick");
    const kc = ne.subOwners!.find((o) => o.name === "The Korman Co")!;
    expect(kc.ownerPct).toBe(0.096);
    expect(kc.subOwners).toHaveLength(6);
    expect(Math.round(kc.ownerPct! * ne.ownerPct! * 1e6) / 1e6).toBe(0.024);
    // Reynolds Metals is an outside partner with nobody behind it.
    expect(ne.subOwners!.find((o) => o.name === "Reynolds Metals Company")!.subOwners).toBeUndefined();
  });

  it("names each person the way the rest of the roster names them", () => {
    // One link per investor matches by NAME across every partnership, so a
    // variant spelling would mint a second link for someone who has one.
    const elsewhere = new Set(
      PROPERTY_OWNERSHIP.filter((p) => p.propertyCode !== "0300").flatMap((p) => p.owners.map((o) => o.name)),
    );
    const PEOPLE = ["Berton E. Korman", "Steven H. Korman", "Alison Korman Feldman", "Catherine Korman Altman", "Susan Korman Schurr"];
    const named = new Set(p0300.owners.flatMap((o) => o.subOwners ?? []).map((o) => o.name));
    for (const n of PEOPLE) {
      expect(named, n).toContain(n);
      expect(elsewhere, n).toContain(n);
    }
  });

  it("leaves the two Berton trusts as TRUSTS, not attributed to a person", () => {
    // A judgement worth stating rather than burying. On the schedule the
    // beneficiary column names a person for the GST Subject trusts ("ALISON
    // KORMAN FELDMAN") but simply repeats the trust for these two — so the
    // document does not say whose interest they are, and guessing Berton
    // would group them into his single investor link and put two more K-1s
    // behind it. Keyed as the schedule reads; change only on instruction.
    const kc = byId("k1-0300-kormanco").subOwners!;
    const trusts = kc.filter((o) => /Berton E Korman (2012 Family Trust|Irrev)/.test(o.name));
    expect(trusts).toHaveLength(2);
    for (const t of trusts) expect(t.detailedName).toBeUndefined();

    // Berton's own TUA, by contrast, IS attributed to him — that exact trust
    // already sits on the roster under his name at 7010.
    const tua = byId("k1-0300-aitwo").subOwners!.find((o) => o.detailedName?.includes("TUA"))!;
    expect(tua.name).toBe("Berton E. Korman");
  });
});

describe("9200 Eastwick Development JV XII — the same chain, its own rows", () => {
  it("carries the identical ownership structure", () => {
    // The two share one ownership schedule because they share one chain, which
    // is why the structure is built once and stamped onto both.
    const shape = (p: typeof p0300) =>
      p.owners.map((o) => [o.name, o.ownerPct, (o.subOwners ?? []).map((s) => [s.name, s.ownerPct])]);
    expect(shape(p9200)).toEqual(shape(p0300));
    expect(p9200.hasK1Distribution).toBe(true);
  });

  it("gives every row its OWN id — the two issue their own K-1s", () => {
    // An id is a K-1 upload target and a Filing Tracker key. Shared ids would
    // put one property's K-1 on the other's row.
    const ids = (p: typeof p0300): string[] =>
      p.owners.flatMap(function walk(o): string[] {
        return [o.id, ...(o.subOwners ?? []).flatMap(walk)];
      });
    const a = ids(p0300), b = ids(p9200);
    expect(a.length).toBeGreaterThan(20);
    expect(a.length).toBe(b.length);
    expect(a.some((id) => b.includes(id))).toBe(false);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
    expect(a.every((id) => id.startsWith("k1-0300"))).toBe(true);
    expect(b.every((id) => id.startsWith("k1-9200"))).toBe(true);
  });
});

describe("the two are valued separately — the schedule totals them", () => {
  it("9200 carries its own equity, not the pair's", () => {
    // The ownership schedule prints one set of dollars totalling $402,210,
    // which is BOTH entities. Carried as 402,210 against 9200, the portfolio
    // double-counted 0300's 5,983 — 0300 being its own row as well.
    expect(entityValue("9200")!.equityValue).toBe(396227);
    expect(entityValue("0300")!.equityValue).toBe(5983);
  });

  it("and the two still reconcile to the schedule's total", () => {
    const pair = entityValue("9200")!.equityValue! + entityValue("0300")!.equityValue!;
    expect(pair).toBe(402210);
    // The schedule's per-partner dollars are that combined figure split by the
    // shared percentages — which is what makes them the pair's, not either
    // one's, and why none of them is imported onto an owner row.
    expect(Math.round(pair * 0.005)).toBe(2011);
    expect(Math.round(pair * 0.745)).toBe(299646);
    expect(Math.round(pair * 0.25)).toBe(100553);
  });
});

describe("properties that must accept K-1 uploads", () => {
  it("4500 Grays Ferry is flagged — eleven partners, eleven K-1s", () => {
    const p = PROPERTY_OWNERSHIP.find((x) => x.propertyCode === "4500")!;
    expect(p.hasK1Distribution).toBe(true);
    expect(p.owners).toHaveLength(11);
  });

  it("every flagged partnership has owners to upload against", () => {
    // A property flagged with an empty roster would appear in the picker with
    // nowhere to drop anything, and would read as permanently incomplete.
    for (const p of PROPERTY_OWNERSHIP.filter((x) => x.hasK1Distribution)) {
      expect(p.owners.length, p.propertyCode).toBeGreaterThan(0);
    }
  });
});

describe("2300 Brookwood — two partners, two K-1s", () => {
  it("is flagged as distributing, or it is absent from the K-1 picker", () => {
    // The API offers only partnerships marked hasK1Distribution. Unflagged,
    // Brookwood could not be selected, so there was nowhere to drop its K-1s
    // and no task for them on the tax tracker.
    const p = PROPERTY_OWNERSHIP.find((x) => x.propertyCode === "2300")!;
    expect(p.hasK1Distribution).toBe(true);
    expect(p.owners.map((o) => o.name)).toEqual(["Hyman Korman Co.", "The Korman Co"]);
    // Both are entities holding the property directly — no sub-owners, so both
    // rows take an upload.
    expect(p.owners.every((o) => !o.subOwners)).toBe(true);
    expect(p.owners.reduce((t, o) => t + (o.ownerPct ?? 0), 0)).toBe(1);
  });
});
