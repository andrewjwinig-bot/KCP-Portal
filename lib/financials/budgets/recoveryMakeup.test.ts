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
    expect(mk.poolYear).toBe(12000); // snow + landscaping
    expect(mk.ratioYear).toBeCloseTo(80);
  });
  it("measures RET against the tax lines only", () => {
    const mk = recoveryMakeup("ret", 3, [t("1", "A", 0, 900)], sections, "retail");
    expect(mk.poolYear).toBe(12000);
    expect(mk.ratioYear).toBeCloseTo(90);
  });
  it("office recovers insurance inside CAM", () => {
    expect(recoveryMakeup("cam", 0, [], sections, "office").poolYear).toBe(14400);
    expect(recoveryCategory("Insurance Reimbursement", "", "office")).toBeNull();
    expect(recoveryCategory("Insurance Reimbursement", "", "retail")).toBe("ins");
    expect(recoveryCategory("Real Estate Tax Reimbursement", "", "retail")).toBe("ret");
  });
  it("has no monthly ratio — a flat estimate against a lumpy month means nothing", () => {
    const mk = recoveryMakeup("cam", 0, [t("1", "A", 800, 0)], sections, "retail");
    expect(mk).not.toHaveProperty("ratio");
    expect(mk).not.toHaveProperty("pool");
  });
  it("sets each tenant's share of the year's pool against its SF share for the months it pays", () => {
    const rent = (months: number) => new Array(12).fill(0).map((_, i) => (i < months ? 1000 : 0));
    const a = { ...t("1", "A", 400, 0), sqft: 3000, rent: rent(12) };
    const b = { ...t("2", "B", 100, 0), sqft: 1000, rent: rent(6) };
    const vacant = { ...t("3", "", 0, 0), sqft: 4000, rent: rent(0) };
    const mk = recoveryMakeup("cam", 0, [a, b, vacant], sections, "retail");
    // 3,000 of 8,000 SF all year + 1,000 for half of it = 37.5% + 6.25%
    expect(mk.leasedShare).toBeCloseTo(43.75);
    const rowA = mk.tenants.find((x) => x.unitRef === "1")!;
    expect(rowA.year).toBe(4800);
    expect(rowA.poolShare).toBeCloseTo(40);
    expect(rowA.sfShare).toBeCloseTo(37.5);
  });
});
