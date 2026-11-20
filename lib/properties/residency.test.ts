import { describe, it, expect } from "vitest";
import { residencyOf } from "./residency";

describe("residencyOf", () => {
  it("PA addresses are residents (no withholding flag)", () => {
    const r = residencyOf("580 W. Germantown Pike #200, Plymouth Meeting, PA 19462");
    expect(r.category).toBe("PA");
    expect(r.nonresident).toBe(false);
    expect(r.state).toBe("PA");
  });

  it("out-of-state addresses are nonresident with the state", () => {
    expect(residencyOf("Bethesda, MD")).toMatchObject({ category: "state", state: "MD", nonresident: true });
    expect(residencyOf("123 Main St, Brooklyn, NY 11238")).toMatchObject({ category: "state", state: "NY", nonresident: true });
  });

  it("Canadian addresses are foreign nonresidents", () => {
    const r = residencyOf("110 Bloor St. West, Apt. 1903, Toronto, Ontario M5S 2W7, Canada");
    expect(r.category).toBe("foreign");
    expect(r.country).toBe("Canada");
    expect(r.nonresident).toBe(true);
  });

  it("c/o PA address still resolves to PA", () => {
    expect(residencyOf("c/o Mark Langsfeld, 1085 Herkness Drive, Meadowbrook, PA 19046").category).toBe("PA");
  });

  it("blank / unknown addresses are not flagged", () => {
    expect(residencyOf("").category).toBe("unknown");
    expect(residencyOf("Somewhere with no state").nonresident).toBe(false);
  });
});
