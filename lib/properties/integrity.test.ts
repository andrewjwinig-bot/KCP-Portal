import { describe, it, expect } from "vitest";
import { PROPERTY_DEFS, BANK_ACCOUNTS, ALLOC_PCT } from "./data";
import { PROPERTY_OWNERSHIP } from "./ownership";
import { PARCEL_INFO } from "../../app/tracker/tax-data";

const knownIds = new Set(PROPERTY_DEFS.map((p) => p.id.toUpperCase()));

// Bank accounts that aren't tied to an operating property (held on the Cash
// Sheet as their own line, e.g. the Leonard Korman Trust).
const NON_PROPERTY_BANK_KEYS = new Set(["LK-TRUST", "2000"]);

describe("data integrity", () => {
  it("every BANK_ACCOUNTS key matches a property in PROPERTY_DEFS", () => {
    for (const code of Object.keys(BANK_ACCOUNTS)) {
      if (NON_PROPERTY_BANK_KEYS.has(code.toUpperCase())) continue;
      expect(knownIds.has(code.toUpperCase()), `BANK_ACCOUNTS has ${code} but PROPERTY_DEFS does not`).toBe(true);
    }
  });

  it("every ALLOC_PCT key matches a property in PROPERTY_DEFS", () => {
    for (const code of Object.keys(ALLOC_PCT)) {
      expect(knownIds.has(code.toUpperCase()), `ALLOC_PCT has ${code} but PROPERTY_DEFS does not`).toBe(true);
    }
  });

  it("every PARCEL_INFO key that looks like a property code matches one", () => {
    // Property codes always start with a digit (e.g. 1100, 3610A, 40A0). Some
    // PARCEL_INFO entries are entity-only (e.g. "PIIICO Condo") with no code
    // prefix; those don't need to match a property.
    for (const key of Object.keys(PARCEL_INFO)) {
      const first = key.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
      if (!/^[0-9]/.test(first)) continue;
      expect(knownIds.has(first), `PARCEL_INFO key "${key}" starts with code "${first}" which is not in PROPERTY_DEFS`).toBe(true);
    }
  });

  it("every PROPERTY_OWNERSHIP property code matches PROPERTY_DEFS", () => {
    for (const p of PROPERTY_OWNERSHIP) {
      expect(knownIds.has(p.propertyCode.toUpperCase()), `PROPERTY_OWNERSHIP has ${p.propertyCode} but PROPERTY_DEFS does not`).toBe(true);
    }
  });
});

describe("vendor codes", () => {
  // Allow 4–6 chars, uppercase letters / digits / a single '/' separator.
  // Examples in the wild: THEK1, HYMA1, TRU/1, T7AKF, AKGST, 19721.
  const VENDOR_CODE_RE = /^[A-Z0-9]{2,5}(?:\/[A-Z0-9])?$/;

  it("all vendor codes match the expected format", () => {
    for (const p of PROPERTY_OWNERSHIP) {
      for (const o of p.owners) {
        if (!o.vendorCode) continue;
        expect(VENDOR_CODE_RE.test(o.vendorCode), `${p.propertyCode} owner ${o.id}: vendor code "${o.vendorCode}" looks malformed`).toBe(true);
      }
    }
  });

  it("each vendor code maps to a single owner identity (by normalized name)", () => {
    // A vendor code is a real-world payee. The same code appearing under two
    // different display names is almost certainly a typo. Trust subtitles
    // (detailedName) are allowed to differ since one entity can hold stakes
    // in multiple properties under different sub-trusts.
    const byCode = new Map<string, Set<string>>();
    for (const p of PROPERTY_OWNERSHIP) {
      for (const o of p.owners) {
        if (!o.vendorCode) continue;
        const norm = o.name.toLowerCase().replace(/\s+/g, " ").trim();
        let names = byCode.get(o.vendorCode);
        if (!names) { names = new Set(); byCode.set(o.vendorCode, names); }
        names.add(norm);
      }
    }
    for (const [code, names] of byCode.entries()) {
      expect(names.size, `vendor code ${code} maps to ${names.size} different names: ${[...names].join(" | ")}`).toBe(1);
    }
  });
});
