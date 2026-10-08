import { describe, it, expect } from "vitest";

// Mirrors `rollSig` in app/api/rentroll/route.ts. Kept here because the route
// is where the self-heal lives and a route module cannot be imported into a
// unit test without dragging in blob storage.
function rollSig(r: any, withMoney: boolean): string {
  if (!r?.properties) return "none";
  const codes = r.properties.map((p: any) => String(p.propertyCode ?? "").toUpperCase()).sort();
  const units = r.properties.reduce((n: number, p: any) => n + (p.units?.length ?? 0), 0);
  if (!withMoney) return `${r.month}|${codes.join(",")}|${units}`;
  let h = 0x811c9dc5;
  for (const p of r.properties) for (const u of p.units ?? []) {
    const cells = `${u.baseRent ?? 0}|${u.opexMonth ?? 0}|${u.reTaxMonth ?? 0}|${u.otherMonth ?? 0};`;
    for (let i = 0; i < cells.length; i++) { h ^= cells.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  }
  return `${r.month}|${codes.join(",")}|${units}|${(h >>> 0).toString(36)}`;
}

// 1100 as it parsed BEFORE the column fixes, and after. Same month, same
// property, same five units — only the figures moved.
const roll = (ferryBase: number, ferryOther: number) => ({
  month: "2026-08",
  properties: [{ propertyCode: "1100", units: [
    { baseRent: 0, opexMonth: 0, reTaxMonth: 0, otherMonth: 0 },
    { baseRent: 0, opexMonth: 0, reTaxMonth: 0, otherMonth: 0 },
    { baseRent: 1732.55, opexMonth: 1117, reTaxMonth: 325, otherMonth: 473 },
    { baseRent: 1321.83, opexMonth: 635, reTaxMonth: 185, otherMonth: 155 },
    { baseRent: ferryBase, opexMonth: 0, reTaxMonth: 0, otherMonth: ferryOther },
  ] }],
});
const stale = roll(0, 2159);      // parsed by the old columns
const fixed = roll(2000, 159);    // parsed after the fix

describe("the rent-roll self-heal has to be able to see a value change", () => {
  it("shape alone cannot tell a re-parsed roll from the stale one", () => {
    // The defect: identical signatures, so the pointer was never rewritten and
    // ten modules reading it kept the wrong figures.
    expect(rollSig(stale, false)).toBe(rollSig(fixed, false));
  });

  it("including the money tells them apart, so the next read repairs it", () => {
    expect(rollSig(stale, true)).not.toBe(rollSig(fixed, true));
  });

  it("a SUM would not have — the figure only MOVED between columns", () => {
    // 0 + 2,159 and 2,000 + 159 are the same total, so the first cut of this
    // fix still could not tell the stale roll from the corrected one. The
    // signature hashes the four figures in order instead.
    const total = (r: any) => r.properties[0].units
      .reduce((n: number, u: any) => n + u.baseRent + u.opexMonth + u.reTaxMonth + u.otherMonth, 0);
    expect(total(stale)).toBeCloseTo(total(fixed), 2);
  });

  it("a roll that genuinely has not changed still matches, so no pointless write", () => {
    expect(rollSig(fixed, true)).toBe(rollSig(roll(2000, 159), true));
  });

  it("catches a change in any of the four money columns", () => {
    for (const k of ["baseRent", "opexMonth", "reTaxMonth", "otherMonth"]) {
      const moved = JSON.parse(JSON.stringify(fixed));
      moved.properties[0].units[2][k] += 1;
      expect(rollSig(moved, true), k).not.toBe(rollSig(fixed, true));
    }
  });
});
