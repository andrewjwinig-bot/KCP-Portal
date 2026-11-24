import { describe, expect, it } from "vitest";
import { PLAN_OFFICES, isRentableOffice, officeLabel, planFromRoll, planSizeRange } from "./offices";

const u = (unitRef: string, sqft: number, occupantName = "") =>
  ({ unitRef, sqft, occupantName, isVacant: !occupantName });
const open = (units: ReturnType<typeof u>[] | null) => planFromRoll(units).filter((o) => o.av).map((o) => o.id);

describe("Office Works floor plan follows the 4900 rent roll", () => {
  it("names Building Five's offices as the plan does", () => {
    expect(officeLabel("4900-5019")).toBe("5-019");
    expect(officeLabel("4900-5-26")).toBe("5-026");
    expect(officeLabel("4900-CONF")).toBe("CONF");
  });
  it("opens exactly the plan's offices the roll has vacant, at the roll's SF", () => {
    const roll = PLAN_OFFICES.map((o) => u(`4900-${o.id.replace("-", "")}`, o.sf, "Tenant"));
    roll[roll.findIndex((x) => x.unitRef === "4900-5008")] = u("4900-5008", 142.4);
    roll[roll.findIndex((x) => x.unitRef === "4900-5032")] = u("4900-5032", 141);
    const plan = planFromRoll(roll);
    expect(plan.filter((o) => o.av).map((o) => o.id)).toEqual(["5-008", "5-032"]);
    expect(plan.find((o) => o.id === "5-008")).toMatchObject({ sf: 142, est: false, x: 1204, cap: 1 });
    expect(plan.every((o) => o.cap >= 1)).toBe(true);
  });
  it("never offers a vacant roll unit the plan does not draw, nor shared space", () => {
    expect(open([u("4900-5001", 173), u("4900-5002", 139), u("4900-5206", 84), u("4900-5026", 130)])).toEqual(["5-026"]);
    expect(isRentableOffice(u("4900-5027", 141, "Conference Room"))).toBe(false);
  });
  it("shows an office the roll does not carry as leased, and the design's flags with no roll", () => {
    expect(open([])).toEqual([]);
    expect(open(null)).toEqual(PLAN_OFFICES.filter((o) => o.av).map((o) => o.id));
  });
  it("reads the size range over every office on the plan", () => {
    expect(planSizeRange(PLAN_OFFICES)).toBe("130–325");
  });
});
