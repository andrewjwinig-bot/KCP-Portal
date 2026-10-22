import { describe, it, expect } from "vitest";
import { taskOccurrencesBetween } from "./taskDefs";

describe("Pay Avid Bills shows from its Wednesday", () => {
  const mon = new Date(2026, 9, 19), sun = new Date(2026, 9, 25, 23, 59);
  const avid = (now: Date) => taskOccurrencesBetween(mon, sun, now).filter((o) => o.label === "Pay Avid Bills");
  it("is off Monday's and Tuesday's lists", () => {
    expect(avid(new Date(2026, 9, 19, 9))).toHaveLength(0);
    expect(avid(new Date(2026, 9, 20, 17))).toHaveLength(0);
  });
  it("appears on Wednesday and stays through the week", () => {
    expect(avid(new Date(2026, 9, 21, 8))).toHaveLength(1);
    expect(avid(new Date(2026, 9, 23, 8))).toHaveLength(1);
  });
});
