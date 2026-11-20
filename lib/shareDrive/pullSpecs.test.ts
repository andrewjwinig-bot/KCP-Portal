import { describe, it, expect } from "vitest";
import { GL_PULL, RENT_ROLL_PULL, CREDIT_BALANCE_PULL, LASER_STATEMENT_PULL, monthFoldersNewestFirst, monthPrefix } from "./pullSpecs";
const f = (names: string[]) => names.map((name, i) => ({ name, modified: i }));

describe("pulling the newest report from the share drive", () => {
  it("reads the month number in front of the name", () => {
    expect(monthPrefix("10 PALL.xls")).toBe(10);
    expect(monthPrefix("9 2026 RR.xls")).toBe(9);
    expect(monthPrefix("4500.xls")).toBeNull();
    expect(monthPrefix("2000 GL.xls")).toBeNull();
  });
  it("the General Ledger: the newest PALL and PFUNDS, never a single-property file", () => {
    const names = ["0800.xls", "4500.xls", "2000 GL.xls", "9 PALL.xls", "10 PALL.xls", "10 PFUNDS.xls", "9 PFUNDS.xls", "PJV3.xls"];
    expect(GL_PULL.pick(f(names)).sort()).toEqual(["10 PALL.xls", "10 PFUNDS.xls"]);
    expect(GL_PULL.segments(2026)).toEqual(["Data", "Accounting", "!2026 Year End", "Reports to Eisner", "Monthly GLs"]);
  });
  it("the Rent Roll: the newest month's RR", () => {
    expect(RENT_ROLL_PULL.pick(f(["7 2026 RR.xls", "10 2026 RR.xls", "11 2026 RR.xls", "9 2026 RR.xls", "12 RR.xls"]))).toEqual(["12 RR.xls"]);
  });
  it("the Credit Balance Report: the one saved most recently, whatever its name", () => {
    const files = [{ name: "12 Credits.xls", modified: 100 }, { name: "01 Credits.xls", modified: 200 }, { name: "~$01 Credits.xls", modified: 300 }];
    expect(CREDIT_BALANCE_PULL.pick(files)).toEqual(["01 Credits.xls"]);
  });
  it("the Laser Statements: the newest month folder, groups before single-tenant re-runs, PDFs over Excel", () => {
    expect(monthFoldersNewestFirst(["1 January", "10 October", "11 November", "9 September", "Archive"])).toEqual(["11 November", "10 October", "9 September", "1 January"]);
    expect(LASER_STATEMENT_PULL.pick(f(["3620-104.pdf", "jviii.pdf", "SC.xls", "Shopping Centers.pdf", "nillc.pdf", "40A0-A.pdf"])))
      .toEqual(["jviii.pdf", "Shopping Centers.pdf", "nillc.pdf", "3620-104.pdf", "40A0-A.pdf"]);
    expect(LASER_STATEMENT_PULL.pick(f(["SC.xls"]))).toEqual(["SC.xls"]);
  });
});
