import { describe, it, expect } from "vitest";
import { coveredOwnerIds } from "./linkCoverage";
import { PROPERTY_OWNERSHIP } from "@/lib/properties/ownership";

/** Someone who really does hold interests in more than one partnership. */
function multiPropertyOwner() {
  const byName = new Map<string, { id: string; code: string }[]>();
  for (const p of PROPERTY_OWNERSHIP) {
    for (const o of p.owners) {
      byName.set(o.name, [...(byName.get(o.name) ?? []), { id: o.id, code: p.propertyCode }]);
    }
  }
  for (const [name, rows] of byName) {
    if (new Set(rows.map((r) => r.code)).size > 1) return { name, rows };
  }
  throw new Error("no multi-property owner in the roster");
}

describe("coveredOwnerIds", () => {
  it("covers every interest the person holds, not just the ids stored at mint", () => {
    const { name, rows } = multiPropertyOwner();
    // A link minted when the person held only their FIRST interest.
    const link = { ownerId: rows[0].id, ownerIds: [rows[0].id], ownerName: name };
    const covered = coveredOwnerIds(link);
    for (const r of rows) {
      expect(covered, `${name} should be covered on ${r.code}`).toContain(r.id);
    }
  });

  it("never drops an id the link already carried", () => {
    const { name, rows } = multiPropertyOwner();
    const link = { ownerId: rows[0].id, ownerIds: rows.map((r) => r.id), ownerName: name };
    expect(coveredOwnerIds(link)).toEqual(expect.arrayContaining(rows.map((r) => r.id)));
  });

  it("does not reach a DIFFERENT person", () => {
    const { name, rows } = multiPropertyOwner();
    const covered = new Set(coveredOwnerIds({ ownerId: rows[0].id, ownerIds: [rows[0].id], ownerName: name }));
    const others = PROPERTY_OWNERSHIP.flatMap((p) => p.owners).filter((o) => o.name !== name);
    for (const o of others) {
      expect(covered.has(o.id), `${o.name} must not be covered by ${name}'s link`).toBe(false);
    }
  });

  it("falls back to the stored ids when the link's owner is no longer on the roster", () => {
    const link = { ownerId: "own-gone-1", ownerIds: ["own-gone-1", "own-gone-2"], ownerName: "" };
    expect(coveredOwnerIds(link).sort()).toEqual(["own-gone-1", "own-gone-2"]);
  });

  it("resolves through the link's own name when its ids are all gone", () => {
    const { name, rows } = multiPropertyOwner();
    const covered = coveredOwnerIds({ ownerId: "own-gone", ownerIds: ["own-gone"], ownerName: name });
    for (const r of rows) expect(covered).toContain(r.id);
  });

  it("handles a link written before `ownerIds` existed", () => {
    const { name, rows } = multiPropertyOwner();
    const legacy = { ownerId: rows[0].id, ownerIds: undefined, ownerName: name } as never;
    expect(coveredOwnerIds(legacy)).toContain(rows[rows.length - 1].id);
  });
});
