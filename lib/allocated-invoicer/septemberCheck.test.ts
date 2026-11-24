import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage", () => ({ getJSON: vi.fn(), storeJSON: vi.fn(), listJSON: vi.fn() }));
import { carriedFromText, from2025Portion } from "./septemberCheck";

describe("carriedFromText", () => {
  it("ties each carried-forward note to the account total above it", () => {
    const text = [
      "8220-9301 Building Maint $1,000.00 23.80% $238.00",
      "8220-8501 Building Maint — Total $238.00",
      "8950-9301 Postage $300.00 23.80% $71.40",
      "8950-8501 Postage — Total $140.33",
      "incl. $68.93 carried forward from prior months",
      "8980-8501 Auto/Vehicle — Total $158.23",
      "incl. $1,058.23 carried forward from prior months",
    ].join("\n");
    expect(carriedFromText(text)).toEqual({ "8950": 68.93, "8980": 1058.23 });
  });
});

describe("from2025Portion", () => {
  it("is at most what 2025 allocated, and never more than the carry", () => {
    expect(from2025Portion(68.93, 40)).toBe(40);
    expect(from2025Portion(30, 40)).toBe(30);
    expect(from2025Portion(50, 0)).toBe(0);
  });
});
