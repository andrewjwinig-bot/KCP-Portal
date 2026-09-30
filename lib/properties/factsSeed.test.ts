import { describe, it, expect } from "vitest";
import { FACTS_SEED } from "./factsSeed";
import { PROPERTY_DEFS } from "./data";
import { FACT_TO_COLUMN } from "@/lib/insurance/sov";

describe("building facts seed", () => {
  it("names only real properties and only facts the form reads", () => {
    const ids = new Set(PROPERTY_DEFS.map((d) => d.id));
    const keys = new Set(FACT_TO_COLUMN.map(([k]) => k));
    for (const [code, facts] of Object.entries(FACTS_SEED)) {
      expect(ids.has(code), code).toBe(true);
      for (const k of Object.keys(facts)) expect(keys.has(k), `${code}.${k}`).toBe(true);
    }
  });

  it("carries no area or suite count — those are the rent roll's", () => {
    for (const facts of Object.values(FACTS_SEED)) {
      expect(facts).not.toHaveProperty("floorArea");
      expect(facts).not.toHaveProperty("units");
    }
  });

  it("counts a property's buildings across its rows", () => {
    expect(FACTS_SEED["8200"].buildingCount).toBe("2");
    expect(FACTS_SEED["9000"].buildingCount).toBe("3");
  });
});
