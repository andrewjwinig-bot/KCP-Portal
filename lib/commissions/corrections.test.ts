import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ getJSON: vi.fn(), storeJSON: vi.fn() }));
import { correctEntries, correctHistory } from "./corrections";

const base = { id: "a", tenant: "Fenningham Stevens", building: "4050", suite: "315", leaseFrom: "2029-01-01", leaseTo: "12/31/2032" } as any;

describe("Fenningham 315 date correction", () => {
  it("moves 2029–2032 to 2026–2029, once", () => {
    const { list, changed } = correctEntries([base, { ...base, id: "b", tenant: "Other" }]);
    expect(changed).toBe(true);
    expect(list[0].leaseFrom).toBe("2026-01-01");
    expect(list[0].leaseTo).toBe("12/31/2029");
    expect(list[1].leaseFrom).toBe("2029-01-01");
    expect(correctEntries(list).changed).toBe(false);
  });
  it("fixes the as-sent record", () => {
    const h: any = { "Q3 26": { a: { entry: base, amount: 1 } } };
    expect(correctHistory(h)).toBe(true);
    expect(h["Q3 26"].a.entry.leaseTo).toBe("12/31/2029");
    expect(correctHistory(h)).toBe(false);
  });
});
