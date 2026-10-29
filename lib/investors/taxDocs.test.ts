import { describe, it, expect } from "vitest";
import { TAX_DOC_KINDS, isTaxDocKind, taxDocLabel } from "./taxDocs";

describe("partnership tax document kinds", () => {
  it("shows the three every partnership has, then the vouchers", () => {
    // Only a few partnerships owe estimates. Putting the vouchers among the
    // universal copies breaks that run with a slot that is legitimately empty
    // most of the time — and an empty slot in the middle reads like something
    // missing rather than something not owed.
    expect(TAX_DOC_KINDS.map((k) => k.id)).toEqual(["client", "government", "partner-k1", "vouchers"]);
  });

  it("says on the vouchers that they are not always owed", () => {
    expect(TAX_DOC_KINDS.at(-1)!.note).toMatch(/only where/i);
  });

  it("still recognises every kind, whatever the order", () => {
    for (const k of TAX_DOC_KINDS) {
      expect(isTaxDocKind(k.id)).toBe(true);
      expect(taxDocLabel(k.id)).toBe(k.label);
    }
    expect(isTaxDocKind("k1")).toBe(false);
    expect(isTaxDocKind(undefined)).toBe(false);
  });
});
