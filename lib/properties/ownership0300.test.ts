import { describe, it, expect } from "vitest";
import { PROPERTY_OWNERSHIP } from "./ownership";

const p0300 = PROPERTY_OWNERSHIP.find((p) => p.propertyCode === "0300")!;

describe("Airport Interplex Two (0300) — its own shareholders", () => {
  it("is on the roster and flagged as distributing K-1s", () => {
    expect(p0300).toBeTruthy();
    expect(p0300.hasK1Distribution).toBe(true);
    expect(p0300.owners).toHaveLength(5);
  });

  it("carries the percentages the schedule states, gap and all", () => {
    // 99.990%, not 100%. The source rounds to three decimals and two thirds
    // plus three ninths do not survive that. Keyed as the document reads —
    // inventing precision it does not have is how a percentage goes wrong.
    const total = p0300.owners.reduce((t, o) => t + (o.ownerPct ?? 0), 0);
    expect(Math.round(total * 1e6) / 1e6).toBe(0.9999);
    expect(p0300.owners.map((o) => o.ownerPct)).toEqual([0.3333, 0.3333, 0.1111, 0.1111, 0.1111]);
  });

  it("names each holder the way the rest of the roster names them", () => {
    // These five all hold interests elsewhere. One link per investor matches
    // by NAME across the whole roster, so a variant spelling here would mint a
    // second link for someone who already has one.
    const namesElsewhere = new Set(
      PROPERTY_OWNERSHIP.filter((p) => p.propertyCode !== "0300").flatMap((p) => p.owners.map((o) => o.name)),
    );
    for (const o of p0300.owners) expect(namesElsewhere, o.name).toContain(o.name);
  });

  it("keeps the trust each interest is held through", () => {
    // Four of the five are held through a trust, and "Held as" is what tells
    // two rows bearing the same person's name apart.
    expect(p0300.owners.filter((o) => o.detailedName)).toHaveLength(4);
    expect(p0300.owners.map((o) => o.detailedName ?? "")).toEqual([
      "Berton E Korman TUA Dtd 02232018",
      "",
      "Leonard I Korman GST Subject TR FBO Alison Feldman",
      "Leonard I Korman GST Subject TR FBO Catherine Altman",
      "Leonard I Korman GST Subject TR FBO Susan Schurr",
    ]);
  });

  it("imports no dollar figures from the schedule", () => {
    // The dollars beside these names on the source are each holder's slice of
    // the Inc.'s $2,011 stake in Eastwick JV XII (9200) — the schedule's actual
    // subject — not their share of this entity. Carrying them over would state
    // another property's numbers as this one's.
    for (const o of p0300.owners) {
      expect(o).not.toHaveProperty("value");
      expect(o.profitPct).toBeUndefined();
      expect(o.capitalPct).toBeUndefined();
    }
  });
});
