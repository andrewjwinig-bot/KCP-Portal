import { describe, it, expect } from "vitest";
import { arSections } from "./arAging";
import { computeWorkpapers } from "./compute";
import type { AgingTenant } from "@/lib/statements/parseAgingReport";

// Synthetic tenants (no real names).
const tenant = (unitRef: string, name: string, lines: number[], unitType = "CURR"): AgingTenant & { unitRef: string; propertyCode: string } => ({
  unitRef, propertyCode: unitRef.split("-")[0], suite: unitRef.split("-")[1], tenantName: name, unitType,
  contact: null, phone: null, depositsHeld: 0,
  balanceDue: Math.round(lines.reduce((a, b) => a + b, 0) * 100) / 100,
  lines: lines.map((amount, i) => ({ code: "RNT", description: "x", dateISO: "2025-12-01", amount, bucket: i } as never)),
  tiesOut: true,
});

describe("arSections", () => {
  const s = arSections([tenant("4500-1", "Shop A", [1000, -200]), tenant("4500-2", "Shop B", [-500]), tenant("2300-9", "Shop C", [75], "FORM")]);
  it("sums each property's net, charges and credits", () => {
    expect(s["4500"]).toMatchObject({ total: 300, charges: 1000, credits: -700 });
    expect(s["2300"].tenants[0]).toMatchObject({ balance: 75, former: true });
  });
});

describe("the workpaper's A/R tie-out", () => {
  const m = (dec: number) => { const a = new Array(12).fill(0); a[11] = dec; return a; };
  const base = {
    key: "4500", year: 2025, asOfMonth: 12,
    gl: { beginning: { "0420-0000": 0, "2110-0000": 0 }, monthly: { "0420-0000": m(-79336), "2110-0000": m(79336) } },
  };
  const top = [{ unitRef: "4500-2", tenantName: "Shop B", balance: -1200, former: false }];
  it("a tie clears the net-credit review — the aging explains it", () => {
    const wp = computeWorkpapers({ ...base, sources: { arAging: { asOf: "2025-12-31", total: -79336, charges: 10000, credits: -89336, tenants: 12, top } } });
    const ar = wp.schedules.find((s) => s.code === "0420-0000")!;
    expect(ar.support?.ties).toBe(true);
    expect(ar.status).toBe("ok");
  });
  it("a gap that is exactly one tenant's balance names the tenant", () => {
    const wp = computeWorkpapers({ ...base, sources: { arAging: { asOf: "2025-12-31", total: -78136, charges: 10000, credits: -88136, tenants: 12, top } } });
    const ar = wp.schedules.find((s) => s.code === "0420-0000")!;
    expect(ar.status).toBe("review");
    expect(ar.flags.map((f) => f.text).join(" ")).toContain("Shop B");
  });
  it("without the aging, a net credit is still for review", () => {
    const wp = computeWorkpapers(base);
    expect(wp.schedules.find((s) => s.code === "0420-0000")!.status).toBe("review");
  });
});
