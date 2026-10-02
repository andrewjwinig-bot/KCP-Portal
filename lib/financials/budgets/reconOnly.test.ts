import { describe, it, expect } from "vitest";
import { landReconOnlyInMay, RECON_COLLECTED_MONTH } from "./reconOnly";

const m = (v: number) => new Array(12).fill(v);
const retail = (recon: any, escrow: any) => ({ kind: "retail", camPrs: 5, insPrs: 0, retPrs: 5, adminFeePct: 15, grossLease: false, capPct: null, excludedLines: 0, reconOcc: null, recon, escrow });

describe("at-recon recoveries land in May", () => {
  const est = (): any => ({
    reconYear: 2025, budgetYear: 2027, ratios: { cam: 1, ins: 1, ret: 1 },
    tenants: [
      // McDonald's at 4500: CAM billed monthly, RET collected only at reconciliation.
      { unitRef: "4500-2851", name: "McDonald's", cam: m(1600), ins: m(0), ret: m(693), method: retail({ cam: 20956, ins: 0, ret: 7074 }, { cam: 26568, ins: 0, ret: 0 }) },
      // JP Morgan: every category billed monthly — untouched.
      { unitRef: "4500-2891", name: "JP Morgan", cam: m(1090), ins: m(42), ret: m(460), method: retail({ cam: 14258, ins: 366, ret: 4785 }, { cam: 18996, ins: 348, ret: 4824 }) },
    ],
    monthly: { cam: m(2690), ins: m(42), ret: m(1153) }, totals: {},
  });
  const rows: any = [
    { unitRef: "4500-2851", billing: { cam: 1550, ins: 0, ret: 0 } },
    { unitRef: "4500-2891", billing: { cam: 1070, ins: 30, ret: 480 } },
  ];
  it("McDonald's RET year is one May amount — the total unchanged", () => {
    const e = landReconOnlyInMay(est(), rows, null);
    const mc = e.tenants[0];
    expect(mc.ret).toEqual(m(0).map((_, i) => (i === RECON_COLLECTED_MONTH ? 693 * 12 : 0)));
    expect(mc.cam).toEqual(m(1600)); // billed monthly, stays monthly
    expect(mc.atRecon).toEqual({ ret: 693 * 12 });
    expect(e.monthly.ret[RECON_COLLECTED_MONTH]).toBe(693 * 12 + 460);
    expect(e.monthly.ret[0]).toBe(460);
    expect(e.monthly.ret.reduce((a: number, b: number) => a + b, 0)).toBe((693 + 460) * 12);
  });
  it("a tenant billed every category monthly is untouched", () => {
    const e = landReconOnlyInMay(est(), rows, null);
    expect(e.tenants[1].ret).toEqual(m(460));
    expect(e.tenants[1].atRecon).toBeUndefined();
  });
  it("a hand-set estimate is a monthly charge, not at recon", () => {
    const x = est(); x.tenants[0].overridden = { ret: true };
    expect(landReconOnlyInMay(x, rows, null).tenants[0].ret).toEqual(m(693));
  });
});
