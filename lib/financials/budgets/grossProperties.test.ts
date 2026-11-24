import { describe, expect, it } from "vitest";
import { isAllGross } from "./grossProperties";
import { estimateRows } from "./estimatesByTenant";
import type { TenantRevenueRow } from "./draft";

const z = () => new Array(12).fill(0);

describe("all-gross properties", () => {
  it("9000 Butler & Main is budgeted gross", () => {
    expect(isAllGross("9000")).toBe(true);
    expect(isAllGross("7300")).toBe(false);
  });

  it("a gross tenant with today's recoveries zeroed gets no monthly estimate row", () => {
    const row = {
      unitRef: "9000-8", tenant: "Francisco Casillo", sqft: 1000, status: "occupied",
      rent: new Array(12).fill(1100), cam: z(), ins: z(), ret: z(), assumed: new Array(12).fill(false),
      method: { kind: "new", sqft: 1000, assumption: "gross" },
      billing: { rent: 1100, cam: 0, ins: 0, ret: 0 },
    } as unknown as TenantRevenueRow;
    expect(estimateRows([row])).toEqual([]);
  });
});
