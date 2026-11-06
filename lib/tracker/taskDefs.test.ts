import { describe, it, expect } from "vitest";
import { taskOccurrencesBetween, tasksForMonth, bankTaskOccurrence } from "./taskDefs";

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

describe("Bank Balances — every Monday, ticked by the import", () => {
  it("expands into one task per Monday, keyed so the import can tick it", () => {
    const oct = tasksForMonth(2026, 9).filter((t) => t.id.startsWith("w-bank-"));
    expect(oct.map((t) => t.dueDay)).toEqual([5, 12, 19, 26]);
    expect(oct[3].id).toBe("w-bank-2026-10-26");
  });
  it("an import ticks the Monday of its week, in Eastern time", () => {
    expect(bankTaskOccurrence(new Date("2026-10-28T15:00:00Z"))).toEqual({ year: 2026, month0: 9, id: "w-bank-2026-10-26" });
    // 11pm Sunday Eastern is still the previous week.
    expect(bankTaskOccurrence(new Date("2026-11-02T03:30:00Z")).id).toBe("w-bank-2026-10-26");
    // A Tuesday on the 1st ticks the prior month's last Monday.
    expect(bankTaskOccurrence(new Date("2026-12-01T15:00:00Z"))).toEqual({ year: 2026, month0: 10, id: "w-bank-2026-11-30" });
  });
});
