import { describe, expect, it } from "vitest";
import { recoveryCategory, recoveryMakeup } from "./recoveryMakeup";

const z = () => new Array(12).fill(0);
const t = (unitRef: string, tenant: string, cam: number, ret: number) =>
  ({ unitRef, tenant, sqft: 1000, status: "occupied", rent: z(), cam: new Array(12).fill(cam), ins: z(), ret: new Array(12).fill(ret), assumed: new Array(12).fill(false) }) as any;
const line = (label: string, m: number) => ({ label, mask: "", months: new Array(12).fill(m), total: m * 12 }) as any;
const sections = [
  { name: "Reimbursements", role: "reimbursement", lines: [], subtotal: z(), total: 0 },
  { name: "Recoverable", role: "reimbursable-expense", lines: [line("Snow Removal", 600), line("Real Estate Taxes", 1000), line("Insurance", 200), line("Landscaping", 400)], subtotal: z(), total: 0 },
] as any;

describe("recoveryMakeup", () => {
  it("lists tenants largest first and sums them", () => {
    const mk = recoveryMakeup("cam", 0, [t("1", "Small", 100, 0), t("2", "Big", 700, 0), t("3", "None", 0, 0)], sections, "retail");
    expect(mk.tenants.map((x) => x.tenant)).toEqual(["Big", "Small"]);
    expect(mk.total).toBe(800);
  });
  it("measures CAM against the non-tax, non-insurance pool", () => {
    const mk = recoveryMakeup("cam", 0, [t("1", "A", 800, 0)], sections, "retail");
    expect(mk.pool).toBe(1000); // snow + landscaping
    expect(mk.ratio).toBeCloseTo(80);
    expect(mk.ratioYear).toBeCloseTo(80);
  });
  it("measures RET against the tax lines only", () => {
    const mk = recoveryMakeup("ret", 3, [t("1", "A", 0, 900)], sections, "retail");
    expect(mk.pool).toBe(1000);
    expect(mk.ratio).toBeCloseTo(90);
  });
  it("office recovers insurance inside CAM", () => {
    expect(recoveryMakeup("cam", 0, [], sections, "office").pool).toBe(1200);
    expect(recoveryCategory("Insurance Reimbursement", "", "office")).toBeNull();
    expect(recoveryCategory("Insurance Reimbursement", "", "retail")).toBe("ins");
    expect(recoveryCategory("Real Estate Tax Reimbursement", "", "retail")).toBe("ret");
  });
});
