import { describe, it, expect } from "vitest";
import { answerNnnQuote, findSuite } from "./nnnQuote";
import type { NnnQuoteData, QuoteSuite } from "@/lib/leasing/nnnQuoteLoad";

const suites: QuoteSuite[] = [
  { unitRef: "9999-104", suite: "104", sqft: 2_000, vacant: true, tenant: "Vacant", pot: "retail", baseRentPsf: null, adminPct: null },
  { unitRef: "9999-110", suite: "110", sqft: 1_000, vacant: false, tenant: "Example Bakery LLC", pot: "retail", baseRentPsf: 30, adminPct: 15 },
];
const data: NnnQuoteData = {
  code: "9999", name: "Example Center", address: "", budgetYear: 2027, gross: false, suites,
  pots: { retail: { gla: 50_000, pools: { cam: 300_000, ins: 20_000, ret: 100_000 }, adminPct: 10, trend: [] } },
};

describe("the assistant's NNN quote", () => {
  it("finds a suite by number, unit ref or tenant name", () => {
    expect(findSuite(suites, "9999", "Suite 104")?.unitRef).toBe("9999-104");
    expect(findSuite(suites, "9999", "9999-110")?.unitRef).toBe("9999-110");
    expect(findSuite(suites, "9999", "bakery")?.unitRef).toBe("9999-110");
  });
  it("a vacancy at the asked rent, the centre's typical admin fee — the page's math", () => {
    const r = answerNnnQuote(data, { suite: "104", base_rent_psf: 24 }) as any;
    expect(r.nnn.perSfYear).toBe(9);          // 6 CAM + 0.60 admin + 0.40 INS + 2 RET
    expect(r.allIn.perSfYear).toBe(33);
    expect(r.adminSource).toMatch(/typical/);
  });
  it("a current tenant starts from their own rent and admin fee", () => {
    const r = answerNnnQuote(data, { suite: "110" }) as any;
    expect(r.baseRentPsf).toBe(30);
    expect(r.adminPct).toBe(15);
  });
  it("no suite: the centre's NNN per SF and its vacancies", () => {
    const r = answerNnnQuote(data, {}) as any;
    expect(r.nnnPerSfBeforeAdmin).toBe(8.4);
    expect(r.vacancies).toHaveLength(1);
  });
});
