import { describe, it, expect } from "vitest";
import { GL_PULL, RENT_ROLL_PULL, monthPrefix } from "./pullSpecs";

describe("pulling the newest report from the share drive", () => {
  it("reads the month number in front of the name", () => {
    expect(monthPrefix("10 PALL.xls")).toBe(10);
    expect(monthPrefix("9 2026 RR.xls")).toBe(9);
    expect(monthPrefix("4500.xls")).toBeNull();
    expect(monthPrefix("2000 GL.xls")).toBeNull();
  });
  it("the General Ledger: the newest PALL and PFUNDS, never a single-property file", () => {
    const names = ["0800.xls", "4500.xls", "2000 GL.xls", "9 PALL.xls", "10 PALL.xls", "10 PFUNDS.xls", "9 PFUNDS.xls", "PJV3.xls"];
    expect(GL_PULL.pick(names).sort()).toEqual(["10 PALL.xls", "10 PFUNDS.xls"]);
    expect(GL_PULL.segments(2026)).toEqual(["Data", "Accounting", "!2026 Year End", "Reports to Eisner", "Monthly GLs"]);
  });
  it("the Rent Roll: the newest month's RR", () => {
    expect(RENT_ROLL_PULL.pick(["7 2026 RR.xls", "10 2026 RR.xls", "11 2026 RR.xls", "9 2026 RR.xls"])).toEqual(["11 2026 RR.xls"]);
  });
});
