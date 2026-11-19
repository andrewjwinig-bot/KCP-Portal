import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/storage", () => ({ getJSON: vi.fn(), storeJSON: vi.fn(), listJSON: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendMailDetailed: vi.fn(), VERIFIED_FROM: "x@y" }));
import { resetRows } from "./januaryReset";

const prop = (billed: { unitRef: string; share: number; billed: number | null }[], noTenancy = false) =>
  ({ code: "7010", noTenancy, billed: billed.map((b) => ({ ...b, tenant: `T ${b.unitRef}` })) }) as never;

describe("January U&O reset", () => {
  it("lists every tenant whose January share moves, and new ones", () => {
    const rows = resetRows({ properties: [prop([
      { unitRef: "7010-1", share: 450, billed: 386 },
      { unitRef: "7010-2", share: 100, billed: 100.4 },
      { unitRef: "7010-3", share: 75, billed: null },
    ])] });
    expect(rows.map((r) => [r.unitRef, r.change])).toEqual([["7010-1", 64], ["7010-3", null]]);
  });
  it("skips a property no rent roll covers", () => {
    expect(resetRows({ properties: [prop([{ unitRef: "7010-1", share: 450, billed: 1 }], true)] })).toEqual([]);
  });
});
