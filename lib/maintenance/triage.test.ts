import { describe, expect, it } from "vitest";
import { classify } from "./triage";

describe("classify — high-priority signals", () => {
  it("flags plumbing leaks as High", () => {
    const r = classify("Water leaking from the ceiling in suite 200 — coming through the tiles.");
    expect(r.priority).toBe("High");
    expect(r.categories).toContain("Plumbing");
  });

  it("flags toilet overflow as Plumbing/High", () => {
    expect(classify("toilet is overflowing in the women's restroom").priority).toBe("High");
  });

  it("flags no power as Electrical/High", () => {
    const r = classify("We have no power in the whole suite, breaker won't reset");
    expect(r.priority).toBe("High");
    expect(r.categories).toContain("Electrical");
  });

  it("flags elevator anything as High", () => {
    expect(classify("Elevator is stuck on the 3rd floor").priority).toBe("High");
    expect(classify("the lift won't open").priority).toBe("High");
  });

  it("flags no heat as HVAC/High", () => {
    expect(classify("no heat in the office this morning").priority).toBe("High");
  });

  it("flags fire/gas as Safety/High", () => {
    expect(classify("we smell gas in the kitchen").priority).toBe("High");
    expect(classify("smoke detector keeps going off and won't stop").priority).toBe("High");
  });

  it("flags locked out as Doors/High", () => {
    expect(classify("I'm locked out of my office").priority).toBe("High");
  });

  it("flags broken glass as Windows/High", () => {
    const r = classify("the window glass shattered overnight");
    expect(r.priority).toBe("High");
    expect(r.categories).toContain("Windows / Glass");
  });

  it("flags roof leak as Exterior/High", () => {
    expect(classify("the roof is leaking in the back hallway").priority).toBe("High");
  });
});

describe("classify — non-emergency signals", () => {
  it("classifies HVAC tuning without priority bump", () => {
    const r = classify("Can someone come adjust the thermostat? Office runs warm.");
    expect(r.categories).toContain("HVAC");
    expect(r.priority).toBe("");
  });

  it("classifies lighting bulb out as Lighting, no priority", () => {
    const r = classify("Two ceiling lights are out near the front desk.");
    expect(r.categories).toContain("Lighting");
    expect(r.priority).toBe("");
  });

  it("classifies pest as Pest Control, no priority", () => {
    const r = classify("Seeing roaches under the kitchen sink");
    expect(r.categories).toContain("Pest Control");
    expect(r.priority).toBe("");
  });

  it("classifies landscaping requests", () => {
    expect(classify("Grass needs to be cut along the parking lot").categories).toContain("Landscaping");
  });
});

describe("classify — guardrails", () => {
  it("returns empty result for blank input", () => {
    expect(classify("")).toEqual({ categories: [], priority: "" });
    expect(classify("   ")).toEqual({ categories: [], priority: "" });
  });

  it("returns empty result when no rule matches", () => {
    expect(classify("Random text with no maintenance keywords whatsoever.")).toEqual({
      categories: [],
      priority: "",
    });
  });

  it("caps categories at 3", () => {
    const r = classify(
      "leak from toilet, also broken window, light is out, AC not working, door won't lock",
    );
    expect(r.categories.length).toBeLessThanOrEqual(3);
    expect(r.priority).toBe("High");
  });

  it("picks the highest priority across multiple rules", () => {
    // Pest is unset; plumbing leak is High → result should be High.
    const r = classify("we have roaches and a small leak under the sink");
    expect(r.priority).toBe("High");
    expect(r.categories).toContain("Plumbing");
    expect(r.categories).toContain("Pest Control");
  });
});
