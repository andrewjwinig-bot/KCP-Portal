import { describe, it, expect } from "vitest";
import { syncSuites, type DesignedSuite } from "./sync";
import { LAFAYETTE_HILL_SUITES } from "./lafayetteHill";

const geo = { x: 0, y: 0, w: 10, h: 10 };
const suite = (s: Partial<DesignedSuite> & { id: string }): DesignedSuite =>
  ({ ...geo, tenant: "", use: "", sf: 0, status: "leased", ...s }) as DesignedSuite;
const unit = (ref: string, occupantName: string, sqft: number) =>
  ({ unitRef: ref, occupantName, isVacant: !occupantName, sqft });

describe("syncSuites", () => {
  it("keeps the curated copy while the roll's tenant matches, taking the roll's SF", () => {
    const s = [suite({ id: "424", rollName: "DKMNK", tenant: "Miles Pet Grooming", url: "x", sf: 1300 })];
    const r = syncSuites(s, [unit("9510-424", "DKMNK, LLC", 837)]);
    expect(r.suites[0]).toMatchObject({ tenant: "Miles Pet Grooming", url: "x", sf: 837, status: "leased" });
    expect(r.changes).toEqual([]);
    expect(r.gla).toBe(837);
  });

  it("shows a suite vacant on the roll as available, dropping the old copy", () => {
    const r = syncSuites([suite({ id: "410", rollName: "Hunan Wok", tenant: "Hunan Wok", url: "x" })], [unit("9510-410", "", 947)]);
    expect(r.suites[0]).toMatchObject({ status: "available", tenant: "", sf: 947 });
    expect(r.suites[0].url).toBeUndefined();
  });

  it("shows a new tenant (turnover, or a lease on an available suite) by its display name", () => {
    const r = syncSuites(
      [suite({ id: "416", status: "available", use: "Retail" }), suite({ id: "408", rollName: "Vino's Pizza", tenant: "Vino's Pizza", logo: "l" })],
      [unit("9510-416", "Acme Corp", 2486), unit("9510-408", "New Pizza LLC", 1035)],
      (n) => (n === "Acme Corp" ? "Acme Coffee" : n),
    );
    expect(r.suites[0]).toMatchObject({ tenant: "Acme Coffee", status: "leased" });
    expect(r.suites[1]).toMatchObject({ tenant: "New Pizza LLC", status: "leased" });
    expect(r.suites[1].logo).toBeUndefined();
  });

  it("draws several roll suites as one storefront and leaves suites the roll lacks alone", () => {
    const s = [suite({ id: "404", units: ["400", "404"], tenant: "From The Boot" }), suite({ id: "999", tenant: "Kept" })];
    const r = syncSuites(s, [unit("9510-400", "", 1200), unit("9510-404", "From The Boot", 3000)]);
    expect(r.suites[0]).toMatchObject({ tenant: "From The Boot", sf: 4200, status: "leased" });
    expect(r.suites[1]).toBe(s[1]);
    expect(syncSuites(s, []).gla).toBeNull();
  });

  it("every Lafayette Hill suite keeps its geometry and a unique id", () => {
    const ids = LAFAYETTE_HILL_SUITES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of LAFAYETTE_HILL_SUITES) expect(s.w * s.h).toBeGreaterThan(0);
  });
});
