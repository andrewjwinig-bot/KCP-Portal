import { describe, it, expect } from "vitest";
import { syncSuites, profilesNeeded, UNPROFILED_TENANT, type DesignedSuite } from "./sync";
import { LAFAYETTE_HILL_SUITES } from "./lafayetteHill";
import { BROOKWOOD_SUITES } from "./brookwood";

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

  it("shows a tenant nobody has described as Coming soon — never the roll's legal name — and asks for it", () => {
    const suites = [suite({ id: "416", status: "available", use: "Retail" }), suite({ id: "408", rollName: "Vino's Pizza", tenant: "Vino's Pizza", logo: "l" })];
    const units = [unit("9510-416", "Acme Corp", 2486), unit("9510-408", "New Pizza LLC", 1035)];
    const r = syncSuites(suites, units);
    expect(r.suites[0]).toMatchObject({ tenant: UNPROFILED_TENANT, status: "leased" });
    expect(r.suites[1]).toMatchObject({ tenant: UNPROFILED_TENANT, status: "leased" });
    expect(r.suites[1].logo).toBeUndefined();
    expect(profilesNeeded(suites, units).map((n) => [n.suite, n.occupant])).toEqual([["416", "Acme Corp"], ["408", "New Pizza LLC"]]);
  });

  it("uses the profile entered for the occupant, and asks again once that tenant leaves", () => {
    const suites = [suite({ id: "416", status: "available" })];
    const profiles = { "416": { rollName: "Acme Corp", tenant: "Acme Coffee", url: "https://acme.test", logo: "/api/center-image?u=x" } };
    const r = syncSuites(suites, [unit("9510-416", "ACME CORP.", 2486)], profiles);
    expect(r.suites[0]).toMatchObject({ tenant: "Acme Coffee", url: "https://acme.test", popLogo: "/api/center-image?u=x", status: "leased" });
    expect(profilesNeeded(suites, [unit("9510-416", "ACME CORP.", 2486)], profiles)).toEqual([]);
    const next = [unit("9510-416", "Zeta LLC", 2486)];
    expect(syncSuites(suites, next, profiles).suites[0].tenant).toBe(UNPROFILED_TENANT);
    expect(profilesNeeded(suites, next, profiles)).toHaveLength(1);
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

  it("Brookwood: every tenant the roll names keeps its copy, 1879 vacant reads available, the shadow anchors are untouched", () => {
    const roll: [string, string, number][] = [
      ["1817", "M&T Bank", 3800], ["1847", "Crafty Crab", 12759], ["1851", "National Fitness Partners", 20433],
      ["1861", "Edible Arrangements", 2000], ["1863", "Cohen Fashion Optical", 1600], ["1867", "T-Mobile Northeast LLC", 3200],
      ["1869", "China Sun", 1600], ["1871", "Lee's Hoagie House", 1600], ["1877", "Evolve Nails", 1600],
      ["1879", "", 1280], ["1881", "Citizens Bank of PA", 2700], ["1885", "Dunkin Donuts", 4000], ["1883", "Wawa", 5000],
    ];
    const r = syncSuites(BROOKWOOD_SUITES, roll.map(([s, n, sf]) => unit(`2300-${s}`, n, sf)));
    expect(r.changes).toEqual([]);
    expect(r.gla).toBe(roll.reduce((t, [, , sf]) => t + sf, 0));
    expect(r.suites.find((s) => s.id === "1879")).toMatchObject({ status: "available", sf: 1280 });
    for (const id of ["regency", "ashley"]) expect(r.suites.find((s) => s.id === id)).toBe(BROOKWOOD_SUITES.find((s) => s.id === id));
    expect(new Set(BROOKWOOD_SUITES.map((s) => s.id)).size).toBe(BROOKWOOD_SUITES.length);
  });
});

describe("Gray's Ferry — diagonal suites keep their polygon through a turnover", () => {
  it("a turned-over polygon suite keeps pts and its label placement", async () => {
    const { GRAYS_FERRY_SUITES } = await import("./graysFerry");
    const hilti = GRAYS_FERRY_SUITES.find((s) => s.id === "3001")!;
    const { suites } = syncSuites([hilti], [{ unitRef: "4500-3001", occupantName: "Someone New LLC", isVacant: false, sqft: 3200 }]);
    expect(suites[0]).toMatchObject({ tenant: UNPROFILED_TENANT, pts: hilti.pts, cx: hilti.cx, cy: hilti.cy, rot: -51 });
  });
  it("every suite names its rent-roll tenant", async () => {
    const { GRAYS_FERRY_SUITES } = await import("./graysFerry");
    expect(GRAYS_FERRY_SUITES.every((s) => s.rollName)).toBe(true);
    expect(GRAYS_FERRY_SUITES.map((s) => s.id)).toHaveLength(10);
  });
});

describe("Parkwood — multi-polygon Wawa, upstairs suites", () => {
  it("Wawa reads the roll's 1230A and keeps both polygons", async () => {
    const { PARKWOOD_SUITES } = await import("./parkwood");
    const wawa = PARKWOOD_SUITES.find((s) => s.id === "12301")!;
    expect(Array.isArray(wawa.pts)).toBe(true);
    const { suites } = syncSuites([wawa], [{ unitRef: "7010-1230A", occupantName: "Wawa, Inc #8035", isVacant: false, sqft: 6237 }]);
    expect(suites[0]).toMatchObject({ tenant: "Wawa", sf: 6237, pts: wawa.pts });
  });
  it("an upstairs suite leasing up keeps its address line and label size", async () => {
    const { PARKWOOD_SUITES } = await import("./parkwood");
    const s206 = PARKWOOD_SUITES.find((s) => s.id === "206")!;
    const { suites } = syncSuites([s206], [{ unitRef: "7010-206", occupantName: "New Tenant LLC", isVacant: false, sqft: 900 }]);
    expect(suites[0]).toMatchObject({ tenant: UNPROFILED_TENANT, addr: "Suite 206 · Second floor", fs: 20 });
  });
});
