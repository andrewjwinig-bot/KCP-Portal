import { describe, it, expect } from "vitest";
import { PROPERTY_OWNERSHIP, type PropertyOwner } from "./ownership";
import { PROPERTY_DEFS } from "./data";
import { ownerSections } from "@/app/investors/ownerSections";

import { entityValue } from "./entityValues";
import { BENEFICIARY_STAKES } from "./beneficiaries";

/** AIRPORT INTERPLEX TWO, INC. — the S-corporation, which files its own return. */
const p0300 = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "0300")!;
/** EASTWICK DEVELOPMENT JV XII — the joint venture the Inc holds 0.50% of. */
const p9200 = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "9200")!;
const pJV = p9200;
const byId = (id: string) => pJV.owners.find((o) => o.id === id)!;

describe("Eastwick Development JV XII (9200) — entities own it, investors sit beneath", () => {
  it("has THREE partners, and they are entities — not the people", () => {
    // The correction this entry exists for. Keyed flat at first, which read as
    // though each person were a direct partner of the property. None is: they
    // hold through three different companies at three different rates.
    //
    // This schedule is the JOINT VENTURE's, and for a while it was keyed onto
    // 0300 as well. 0300 is AIRPORT INTERPLEX TWO, INC. — the 0.50% partner
    // heading a band INSIDE this sheet — and it files its own 1120-S. Both
    // entities printing on one page is what made them read as one structure.
    expect(pJV.hasK1Distribution).toBe(true);
    expect(pJV.owners.map((o) => o.name)).toEqual([
      "Airport Interplex Two, Inc.",
      "The Korman Co",
      "New Eastwick Corporation",
    ]);
    expect(pJV.owners.map((o) => o.ownerPct)).toEqual([0.005, 0.745, 0.25]);
  });

  it("the three partners account for the whole property", () => {
    const total = pJV.owners.reduce((t, o) => t + (o.ownerPct ?? 0), 0);
    expect(Math.round(total * 1e6) / 1e6).toBe(1);
  });

  it("every partner collapses to its own investors", () => {
    for (const o of pJV.owners) expect(o.subOwners?.length, o.name).toBeGreaterThan(0);
    expect(byId("k1-9200-aitwo").subOwners).toHaveLength(5);
    expect(byId("k1-9200-kormanco").subOwners).toHaveLength(6);
    expect(byId("k1-9200-neweastwick").subOwners).toHaveLength(2);
  });

  it("renders as three bands, biggest first, with nothing loose", () => {
    // The screenshot's shape: an entity heads each band with its share of the
    // property and its investors beneath. No "Other investors" section here,
    // because no person holds the property directly.
    const secs = ownerSections(pJV.owners);
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
    const steven = byId("k1-9200-kormanco").subOwners!.find((o) => o.name === "Steven H. Korman")!;
    expect(steven.ownerPct).toBeCloseTo(0.333333, 6);
    expect(steven.ownerPct! * byId("k1-9200-kormanco").ownerPct!).toBeCloseTo(0.248333, 6);
  });

  it("each entity's investors sum to its own 100%", () => {
    const sum = (o: PropertyOwner) => (o.subOwners ?? []).reduce((t, s) => t + (s.ownerPct ?? 0), 0);
    expect(Math.round(sum(byId("k1-9200-kormanco")) * 1e6) / 1e6).toBe(1);
    expect(Math.round(sum(byId("k1-9200-neweastwick")) * 1e6) / 1e6).toBe(1);
    // …except the Inc., whose schedule rounds to three decimals: two thirds
    // plus three ninths land on 99.990%. Keyed as the document reads.
    expect(Math.round(sum(byId("k1-9200-aitwo")) * 1e6) / 1e6).toBe(0.9999);
  });

  it("carries the third tier — The Korman Co inside New Eastwick", () => {
    // 9.6% of New Eastwick's 25% is another 2.4% of the property held by the
    // same company. Stored so the chain is complete even though the roster
    // draws two tiers.
    const ne = byId("k1-9200-neweastwick");
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
    const named = new Set(pJV.owners.flatMap((o) => o.subOwners ?? []).map((o) => o.name));
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
    const kc = byId("k1-9200-kormanco").subOwners!;
    const trusts = kc.filter((o) => /Berton E Korman (2012 Family Trust|Irrev)/.test(o.name));
    expect(trusts).toHaveLength(2);
    for (const t of trusts) expect(t.detailedName).toBeUndefined();

    // Berton's own TUA, by contrast, IS attributed to him — that exact trust
    // already sits on the roster under his name at 7010.
    const tua = byId("k1-9200-aitwo").subOwners!.find((o) => o.detailedName?.includes("TUA"))!;
    expect(tua.name).toBe("Berton E. Korman");
  });
});

describe("Airport Interplex Two, Inc. (0300) — a corporation that files its own return", () => {
  it("is FIVE shareholders, not the joint venture's three entities", () => {
    // It was keyed as the JV and that was wrong. The five K-1s that arrive are
    // titled "Airport Interplex Two Inc … 1120s" — an S-corporation return —
    // and name exactly these shareholders.
    expect(p0300.hasK1Distribution).toBe(true);
    expect(p0300.propertyName).toBe("Airport Interplex Two, Inc.");
    expect(p0300.owners).toHaveLength(5);
    expect(p0300.owners.every((o) => !o.subOwners)).toBe(true);
    expect(p0300.owners.map((o) => o.ownerPct)).toEqual([0.3333, 0.3333, 0.1111, 0.1111, 0.1111]);
  });

  it("totals 99.99% — as the schedule prints it, not rounded up", () => {
    // Inventing the missing hundredth to reach a round number hides whether it
    // is rounding or a shareholder nobody keyed.
    const total = p0300.owners.reduce((t, o) => t + (o.ownerPct ?? 0), 0);
    expect(Math.round(total * 1e6) / 1e6).toBe(0.9999);
  });

  it("keeps the ORIGINAL ids — they are live upload targets", () => {
    // 0300 was first keyed flat with these ids, then restructured as the JV,
    // which orphaned them. Restoring the ids reconnects any K-1 already
    // uploaded against them instead of stranding it.
    expect(p0300.owners.map((o) => o.id)).toEqual([
      "k1-0300-bert4", "k1-0300-stev1", "k1-0300-akgsts", "k1-0300-cagsts", "k1-0300-ssgsts",
    ]);
  });

  it("carries the TRUST as Berton's held-as, under his one investor name", () => {
    // He has died; the trust is the shareholder and its K-1 goes to the
    // trustee. The trust wording belongs in the held-as, NOT the name: keyed
    // as the name it split one trust across two identities — "Berton E.
    // Korman" at 7010/7200/4510 and the trust wording at 0300/WHIT — which
    // one-link-per-investor would have honoured as two people, two links and
    // two PINs with half his K-1s behind each.
    expect(p0300.owners[0].name).toBe("Berton E. Korman");
    expect(p0300.owners[0].detailedName).toBe("Berton E Korman TUA Dtd 02232018");
  });

  it("still holds its 0.50% of the joint venture, where it takes a K-1 too", () => {
    // The two facts coexist: the Inc is a partner of 9200 AND a filer itself.
    const inc = p9200.owners.find((o) => o.name === "Airport Interplex Two, Inc.")!;
    expect(inc.ownerPct).toBe(0.005);
    expect(inc.subOwners).toHaveLength(5);
  });

  it("gives every row its OWN id — the two entities issue their own K-1s", () => {
    // An id is a K-1 upload target and a Filing Tracker key. A shared id would
    // put the Inc's K-1 on the JV's row.
    const ids = (p: typeof p0300): string[] =>
      p.owners.flatMap(function walk(o): string[] {
        return [o.id, ...(o.subOwners ?? []).flatMap(walk)];
      });
    const a = ids(p0300), b = ids(p9200);
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

describe("1500 Eastwick JV I — the same companies, no GP interest", () => {
  const p1500 = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "1500")!;

  it("is two partners at 75/25, and takes K-1 uploads", () => {
    expect(p1500.hasK1Distribution).toBe(true);
    expect(p1500.owners.map((o) => [o.name, o.ownerPct])).toEqual([
      ["The Korman Co", 0.75],
      ["New Eastwick Corporation", 0.25],
    ]);
    // No Airport Interplex Two, Inc. here — that GP interest is 0300/9200's.
    expect(p1500.owners.some((o) => o.name.includes("Airport"))).toBe(false);
  });

  it("reuses the same entity definitions, not a third copy", () => {
    // Three properties share these companies. The investors behind The Korman
    // Co must be identical everywhere or the three quietly diverge.
    const kcOf = (code: string) =>
      PROPERTY_OWNERSHIP.find((p) => p.propertyCode === code)!
        .owners.find((o) => o.name === "The Korman Co")!
        .subOwners!.map((s) => [s.name, s.ownerPct]);
    expect(kcOf("1500")).toEqual(kcOf("9200"));
    expect(kcOf("1500")).toEqual(kcOf("9200"));
  });

  it("gives 1500 its own ids", () => {
    const ids = (p: typeof p1500): string[] =>
      p.owners.flatMap(function walk(o): string[] { return [o.id, ...(o.subOwners ?? []).flatMap(walk)]; });
    const mine = ids(p1500);
    expect(mine.every((id) => id.startsWith("k1-1500"))).toBe(true);
    const others = new Set([
      ...ids(PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "0300")!),
      ...ids(PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "9200")!),
    ]);
    expect(mine.some((id) => others.has(id))).toBe(false);
  });

  it("values tie to the Statement of Values with nothing double-counted", () => {
    // 401,544 + 133,848 = 535,392. Unlike the 0300/9200 schedule, this one
    // describes a single entity — worth pinning, since that sheet's combined
    // total is exactly the trap that overstated the portfolio.
    expect(401_544 + 133_848).toBe(entityValue("1500")!.equityValue);
  });

  it("a partner's share of the property is its share × its entity's", () => {
    const kc = p1500.owners.find((o) => o.name === "The Korman Co")!;
    const steven = kc.subOwners!.find((o) => o.name === "Steven H. Korman")!;
    // A third of 75% is 25% of the property — not 33%.
    expect(steven.ownerPct! * kc.ownerPct!).toBeCloseTo(0.25, 6);
  });
});

describe("4510 Grays Ferry SC Assoc., Inc. — a GP that files its own return", () => {
  const p4510 = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "4510")!;

  it("takes K-1 uploads for its five shareholders", () => {
    // It sits inside 4500 as a 0.10% owner, and a sub-owner is not an upload
    // target — so without a roster of its own there was nowhere to drop these.
    expect(p4510.hasK1Distribution).toBe(true);
    expect(p4510.owners).toHaveLength(5);
    expect(p4510.owners.map((o) => o.ownerPct)).toEqual([0.333333, 0.333333, 0.111111, 0.111111, 0.111111]);
    expect(p4510.owners.every((o) => !o.subOwners)).toBe(true);
  });

  it("carries its own display name, because it is not a property", () => {
    // It owns no real estate and is deliberately absent from PROPERTY_DEFS, so
    // the roster and the K-1 picker read this label instead of a bare "4510".
    expect(p4510.propertyName).toBe("Grays Ferry SC Assoc., Inc. (GP)");
    expect(PROPERTY_DEFS.some((d) => d.id === "4510")).toBe(false);
  });

  it("is NOT valued separately — that would double-count 4500", () => {
    // Its $9,682 is 0.10% of Grays Ferry's $9,681,628 and already sits inside
    // it. A row of its own is exactly what 9200 did to 0300.
    expect(entityValue("4510")).toBeUndefined();
    const gp = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "4500")!
      .owners.find((o) => o.name.startsWith("GRAYS FERRY SC ASSOC"))!;
    expect(gp.ownerPct).toBe(0.001);
    expect(Math.round(entityValue("4500")!.equityValue! * gp.ownerPct!)).toBe(9682);
  });

  it("names its shareholders the way the rest of the roster does", () => {
    const elsewhere = new Set(
      PROPERTY_OWNERSHIP.filter((p) => p.propertyCode !== "4510").flatMap((p) => p.owners.map((o) => o.name)),
    );
    for (const o of p4510.owners) expect(elsewhere, o.name).toContain(o.name);
  });
});

describe("the office parks — 3600 and 4000", () => {
  const p3600 = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "3600")!;
  const p4000 = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "4000")!;

  it("3600 is two corporate partners, each collapsing to its investors", () => {
    expect(p3600.hasK1Distribution).toBe(true);
    expect(p3600.owners.map((o) => [o.name, o.ownerPct])).toEqual([
      ["Hyman Korman Co.", 0.70857],
      ["The Korman Co", 0.29143],
    ]);
    expect(p3600.owners[0].subOwners).toHaveLength(24);
    expect(p3600.owners[1].subOwners).toHaveLength(6);
  });

  it("4000's derived HKC share closes the schedule to exactly 100%", () => {
    // The schedule lists five partners and says the rest is HKC. 100 − 99.791
    // = 0.209, which is not written anywhere — so it is asserted here, where a
    // later "correction" would have to argue with the arithmetic.
    const listed = p4000.owners.filter((o) => o.name !== "Hyman Korman Co.");
    expect(Math.round(listed.reduce((t, o) => t + o.ownerPct!, 0) * 1e6) / 1e6).toBe(0.99791);
    expect(p4000.owners.find((o) => o.name === "Hyman Korman Co.")!.ownerPct).toBe(0.00209);
  });

  it("both properties account for 100% of themselves", () => {
    for (const p of [p3600, p4000]) {
      expect(Math.round(p.owners.reduce((t, o) => t + (o.ownerPct ?? 0), 0) * 1e6) / 1e6, p.propertyCode).toBe(1);
    }
  });

  it("LIK Management collapses to its investor rather than being renamed", () => {
    // The schedule names Alison behind it, but the PARTNER is the company and
    // the K-1 is issued to the company — so it reads as an entity band, the
    // way every other corporate partner does.
    const lik = p4000.owners.find((o) => o.name === "LIK Management, Inc.")!;
    expect(lik.subOwners).toEqual([expect.objectContaining({ name: "Alison Korman Feldman", ownerPct: 1 })]);
  });

  it("Hyman Korman Co. has ONE shareholder roster, shared by every property", () => {
    // Its shareholders are its own — the same people whatever it holds. Three
    // hand-kept copies is how they would quietly stop agreeing.
    const hkcOf = (code: string) =>
      PROPERTY_OWNERSHIP.find((p) => p.propertyCode === code)!
        .owners.find((o) => o.name === "Hyman Korman Co.")!
        .subOwners!.map((s) => [s.name, s.detailedName, s.ownerPct]);
    expect(hkcOf("3600")).toEqual(hkcOf("0800"));
    expect(hkcOf("4000")).toEqual(hkcOf("0800"));
  });

  it("does NOT move 0800's existing ids — they are live upload targets", () => {
    // Extracting the shared roster must not rename an id a K-1 may already be
    // attached to. Suffixes are preserved; only the prefix varies.
    const ids = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "0800")!
      .owners.find((o) => o.name === "Hyman Korman Co.")!.subOwners!.map((s) => s.id);
    expect(ids[0]).toBe("own-0800-hkc-lawrence-m-korman-dba4ef");
    expect(ids.at(-1)).toBe("own-0800-hkc-lynne-honickman-dde0f5");
    expect(ids.every((id) => id.startsWith("own-0800-hkc-"))).toBe(true);
  });
});

describe("4900 The Office Works", () => {
  const p = () => PROPERTY_OWNERSHIP.find((x) => x.propertyCode === "4900")!;

  it("is two K-1 rows, an even split between the family companies", () => {
    const o = p().owners;
    expect(o.map((x) => x.name)).toEqual(["Hyman Korman Co.", "The Korman Co"]);
    expect(o.map((x) => x.ownerPct)).toEqual([0.5, 0.5]);
    expect(p().hasK1Distribution).toBe(true);
  });

  it("the 50/50 is confirmed by the beneficiary map, independently sourced", () => {
    // Every 4900 beneficiary row is exactly half that person's share of their
    // company. Two maps built from different documents agreeing to the fifth
    // decimal is the strongest evidence an ownership figure here gets.
    const ben = (partner: string) =>
      BENEFICIARY_STAKES.find((b) => b.entity === "4900" && b.partner === partner)!.effPct;
    // Lawrence holds 5.4693% of Hyman Korman Co.
    expect(ben("GST EXEMPT TRUST U/I 3 U/W SJK FBO STEVEN H. KORMAN/LMK")).toBeCloseTo(0.054693 * 0.5, 9);
    // Steven holds a third of The Korman Co. The roster keys it to six
    // figures and the map carries the repeating third, so they agree to a
    // ten-thousandth of a percent rather than exactly.
    expect(ben("STEVEN H KORMAN")).toBeCloseTo(1 / 3 * 0.5, 6);
  });

  it("collapses to the companies' own investors, who take no upload", () => {
    const [hkc, kco] = p().owners;
    expect(hkc.subOwners).toHaveLength(24);
    expect(kco.subOwners).toHaveLength(6);
  });
});

describe("WHIT Whitpain Associates", () => {
  const p = () => PROPERTY_OWNERSHIP.find((x) => x.propertyCode === "WHIT")!;

  it("is The Korman Co at 75% plus five DIRECT partners holding the rest", () => {
    const o = p().owners;
    expect(o).toHaveLength(6);
    expect(o[0].name).toBe("The Korman Co");
    expect(o[0].ownerPct).toBe(0.75);
    expect(o.slice(1).every((x) => !x.subOwners)).toBe(true);
    expect(o.reduce((s, x) => s + x.ownerPct, 0)).toBeCloseTo(1, 9);
  });

  it("the direct quarter is exact, not a rounded 24.99994%", () => {
    // 2 × 1/12 + 3 × 1/36 = 1/4. The schedule prints 8.3333% and 2.77778%.
    const direct = p().owners.slice(1).reduce((s, x) => s + x.ownerPct, 0);
    expect(direct).toBeCloseTo(0.25, 6);
  });

  it("Berton's DIRECT trust is not the two trusts held through the company", () => {
    // The direct quarter carries one BERTON E KORMAN TUA DTD 02232018; The
    // Korman Co carries the 2012 Family Trust and the 1999 Irrevocable. Three
    // separate K-1s — treating the lists as the same one files his to the
    // wrong trust.
    // Named "Berton E. Korman" with the trust as the held-as, matching his
    // six other interests — keying the trust wording as the NAME split one
    // trust into two investors holding two links.
    const held = p().owners.map((o) => o.detailedName ?? "");
    expect(held).toContain("Berton E Korman TUA Dtd 02232018");
    expect(p().owners.map((o) => o.name)).toContain("Berton E. Korman");
    const kco = p().owners[0].subOwners!.map((s) => s.name);
    expect(kco).toContain("The Berton E Korman 2012 Family Trust");
    expect(kco).toContain("The Berton E Korman Irrev TR Dtd 03031999");
    expect(kco).not.toContain("Berton E. Korman");
  });

  it("reconciles to the beneficiary map, which carries BOTH of Steven's tiers", () => {
    // Steven holds 25% through the company and 8.3333% directly. The map was
    // built from the other direction and lists exactly that pair — which is
    // what rules out the five direct partners being the company's own roster.
    const steven = BENEFICIARY_STAKES.filter((b) => b.entity === "WHIT" && b.partner === "STEVEN H KORMAN");
    expect(steven).toHaveLength(2);
    expect(steven.map((s) => s.effPct).sort((a, b) => b - a)[0]).toBeCloseTo(0.333333 * 0.75, 6);
    expect(steven.map((s) => s.effPct).sort((a, b) => b - a)[1]).toBeCloseTo(1 / 12, 6);
  });
});

describe("CWD Cherrywood Joint Venture", () => {
  const p = () => PROPERTY_OWNERSHIP.find((x) => x.propertyCode === "CWD")!;

  it("is 23 partners, all holding directly — no entity tier", () => {
    expect(p().hasK1Distribution).toBe(true);
    expect(p().owners).toHaveLength(23);
    expect(p().owners.every((o) => !o.subOwners)).toBe(true);
    expect(p().owners.reduce((s, o) => s + (o.ownerPct ?? 0), 0)).toBeCloseTo(1, 4);
  });

  it("ties to the beneficiary map row for row", () => {
    // Unusually, the two levels coincide here: nothing sits between the
    // partnership and its partners, so the look-through map IS the roster.
    // That makes it a genuine cross-check rather than a circular one.
    const ben = BENEFICIARY_STAKES.filter((b) => b.entity === "CWD");
    expect(ben).toHaveLength(23);
    // A row is matched on the trust wording where it has one, and otherwise on
    // the person — with middle initials dropped, since the roster spells them
    // canonically ("Steven H. Korman") and the schedule does not.
    // First and last name only: the roster spells people canonically
    // ("Steven H. Korman", "Shirley Honickman Hahn") and the schedule does not
    // ("STEVEN KORMAN", "SHIRLEY HAHN").
    const loose = (x: string) => {
      const w = x.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((t) => t.length > 1);
      return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : w.join(" ");
    };
    const used = new Set<string>();
    for (const o of p().owners) {
      const match = ben.find((b) =>
        !used.has(b.partner) && (
          (!!o.detailedName && o.detailedName.toUpperCase().replace(/\s+/g, " ").trim() === b.partner.toUpperCase().replace(/\s+/g, " ").trim())
          || loose(o.name) === loose(b.beneficiary)
        ));
      expect(match, `no beneficiary row for ${o.name}`).toBeTruthy();
      used.add(match!.partner);
      expect(o.ownerPct).toBeCloseTo(match!.effPct, 8);
    }
    expect(used.size).toBe(23);
  });

  it("names partners canonically so their link is not split in two", () => {
    // One link per investor groups by NAME. The schedule prints "SHIRLEY
    // HAHN"; every other roster says "Shirley Honickman Hahn". Keyed as
    // printed she would hold a SECOND link and PIN, and her Cherrywood K-1
    // would not sit with the rest.
    const names = p().owners.map((o) => o.name);
    expect(names).toContain("Shirley Honickman Hahn");
    expect(names).not.toContain("Shirley Hahn");
    expect(names).toContain("Joan R. Sohn");
    expect(names).toContain("Steven H. Korman");
  });

  it("Alison's share still ties to the workbook figure", () => {
    const a = p().owners.find((o) => o.name === "Alison Korman Feldman")!;
    expect(Math.round(a.ownerPct! * entityValue("CWD")!.equityValue!)).toBe(1576797);
  });
});
