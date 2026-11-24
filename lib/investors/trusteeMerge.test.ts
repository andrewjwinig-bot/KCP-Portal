import { describe, it, expect } from "vitest";
import { mergeTrusteeRows, type TrusteeRowOverride } from "./structures";
import type { TrusteeDirectoryRow } from "./structures";

const seed: TrusteeDirectoryRow[] = [
  { name: "Alison Korman Feldman", address: "6015 Sheaff Lane", city: "Fort Washington", state: "PA", zip: "19034", servingIndividually: "No", trusts: "Max Korman Trust", sourceInstrument: "Will of Max Korman", email: "old@x.com" },
  { name: "Harry Feldman", address: "7254 Fir Road", city: "Ambler", state: "PA", zip: "19002", servingIndividually: "No", trusts: "Max Korman Trust", sourceInstrument: "Will of Max Korman" },
];

describe("mergeTrusteeRows", () => {
  it("returns the seed unchanged when there are no overrides", () => {
    expect(mergeTrusteeRows(seed, {})).toEqual(seed);
  });

  it("overlays only the provided fields on a seeded row (by normalized name)", () => {
    const ov: Record<string, TrusteeRowOverride> = {
      "alison korman feldman": { name: "Alison Korman Feldman", email: "new@x.com" },
    };
    const out = mergeTrusteeRows(seed, ov);
    expect(out[0].email).toBe("new@x.com");
    expect(out[0].address).toBe("6015 Sheaff Lane"); // untouched
  });

  it("drops a row flagged deleted", () => {
    const out = mergeTrusteeRows(seed, { "harry feldman": { name: "Harry Feldman", deleted: true } });
    expect(out.map((r) => r.name)).toEqual(["Alison Korman Feldman"]);
  });

  it("appends an added trustee (alphabetized after seed rows)", () => {
    const out = mergeTrusteeRows(seed, {
      "zelda korman": { name: "Zelda Korman", email: "z@x.com", address: "1 Main", city: "Phila", state: "PA", servingIndividually: "No", trusts: "New Trust", sourceInstrument: "New Will" },
    });
    expect(out).toHaveLength(3);
    expect(out[2].name).toBe("Zelda Korman");
    expect(out[2].email).toBe("z@x.com");
  });
});
