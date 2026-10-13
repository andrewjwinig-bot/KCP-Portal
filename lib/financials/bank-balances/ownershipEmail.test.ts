import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ getJSON: vi.fn(), storeJSON: vi.fn(), listJSON: vi.fn() }));
import { cleanRecipients, freshThisWeek, weekOf } from "./ownershipEmail";

describe("Monday cash position email", () => {
  it("weeks start Monday, Eastern", () => {
    expect(weekOf(new Date("2026-10-19T14:00:00Z"))).toBe("2026-10-19"); // Mon
    expect(weekOf(new Date("2026-10-25T14:00:00Z"))).toBe("2026-10-19"); // Sun
    expect(weekOf(new Date("2026-10-19T02:00:00Z"))).toBe("2026-10-12"); // Sun 10pm ET
  });
  it("sends only once every bank is in for the week", () => {
    const now = new Date("2026-10-20T15:00:00Z");
    const bank = (importedAt: string) => ({ bank: "x", asOf: null, importedAt, importedBy: null, accounts: 1 });
    const view = (...at: string[]) => ({ byBank: at.map(bank) }) as any;
    expect(freshThisWeek(view("2026-10-19T13:00:00Z", "2026-10-20T13:00:00Z"), now)).toBe(true);
    expect(freshThisWeek(view("2026-10-19T13:00:00Z", "2026-10-16T13:00:00Z"), now)).toBe(false);
    expect(freshThisWeek(view(), now)).toBe(false);
  });
  it("keeps only real addresses, once", () => {
    expect(cleanRecipients(["A@x.com", "a@x.com", "nope", " b@y.org "])).toEqual(["a@x.com", "b@y.org"]);
  });
});
