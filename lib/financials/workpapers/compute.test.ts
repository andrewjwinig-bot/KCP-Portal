import { describe, it, expect } from "vitest";
import { computeWorkpapers, possibleDuplicates, kindOf } from "./compute";
import type { GlTransaction } from "@/lib/financials/operating-statements/glParser";

// Shapes taken from the accountants' 12/31/2025 workpaper for 4500 (figures
// rounded, no tenant data): a Suspense plug, a commission booked twice and
// reversed at year end, an unbilled CAM credit, the mortgage.
const m = (dec: number) => { const a = new Array(12).fill(0); a[11] = dec; return a; };
const t = (month: number, date: string, description: string, amount: number): GlTransaction => ({ month, date, description, ref: "", amount });

const gl = {
  beginning: {
    "0110-0000": 1294545.48, "0300-0000": 0, "0450-0001": 17845.02, "1940-8501": 752482.38,
    "2740-0000": -9000000, "2740-8501": 770707.62, "0410-0000": 90084.96,
    "4230-8501": 0, "3600-0000": -(1294545.48 + 17845.02 + 752482.38 - 9000000 + 770707.62 + 90084.96),
  },
  monthly: {
    "0110-0000": m(-19361.80 - 255565.64),
    "0300-0000": m(19361.80),
    "0450-0001": m(-23391.40),
    "1940-8501": m(5760),
    "2740-8501": m(255565.64),
    "4230-8501": m(23391.40 - 5760),
  } as Record<string, number[]>,
  names: { "0300-0000": "Suspense Account", "0450-0001": "CAM Receivable - Unbilled", "0410-0000": "PPD Rent Adj Account" },
};
const transactions: Record<string, GlTransaction[]> = {
  "0110-0000": [t(12, "2025-12-31", "cash out", -19361.80 - 255565.64)],
  "0300-0000": [t(12, "2025-12-31", "YE 2025 Variance Entry", 16252.55), t(12, "2025-12-31", "YE 2025 Variance Entry", 3109.25)],
  "0450-0001": [t(12, "2025-12-31", "YEC to 4500-3021", -23391.40)],
  "1940-8501": [
    t(3, "2025-03-27", "LIK Management-Clearing", 5760),
    t(6, "2025-06-30", "LIK Management-Clearing", 5760),
    t(12, "2025-12-30", "Set up Rec for Dup Comm", -5760),
  ],
  "2740-8501": [t(12, "2025-12-31", "Liberty Bank", 255565.64)],
  "4230-8501": [t(12, "2025-12-31", "rent", 23391.40 - 5760)],
};

describe("computeWorkpapers", () => {
  const wp = computeWorkpapers({
    key: "4500", year: 2025, asOfMonth: 12, gl, transactions,
    sources: { debtPrincipal: { amount: 7973726.74, loans: 1 }, depositsHeld: null, bankRec: null },
  });
  const by = (c: string) => wp.schedules.find((s) => s.code === c)!;

  it("proves the trial balance", () => {
    expect(wp.trialBalance.balances).toBe(true);
    expect(wp.quarter).toBe(4);
  });
  it("flags the Suspense plug red", () => {
    expect(by("0300-0000").status).toBe("fix");
    expect(by("0300-0000").flags[0].text).toContain("$19,361.80");
  });
  it("flags an unbilled CAM credit for review", () => {
    expect(by("0450-0001").ending).toBeCloseTo(-5546.38, 2);
    expect(by("0450-0001").status).toBe("review");
  });
  it("finds the duplicate commission and that it was reversed", () => {
    const f = by("1940-8501").flags.find((x) => x.text.startsWith("Possible duplicate"));
    expect(f?.level).toBe("info");
    expect(f?.text).toContain("reversed on 12/30");
  });
  it("ties the mortgage to the lender schedule", () => {
    expect(by("2740-0000").support?.ties).toBe(true);
    expect(by("2740-0000").status).toBe("ok");
  });
  it("calls out a balance with no activity all year", () => {
    expect(by("0410-0000").flags.some((f) => f.level === "info" && f.text.startsWith("No activity"))).toBe(true);
  });
  it("every schedule's entries explain its balance", () => {
    for (const s of wp.schedules) expect(Math.abs(s.unexplained)).toBeLessThan(0.5);
  });
  it("reads a quarter, not the year", () => {
    const q1 = computeWorkpapers({ key: "4500", year: 2025, asOfMonth: 3, gl, transactions });
    expect(q1.schedules.find((s) => s.code === "1940-8501")!.lines).toHaveLength(1);
  });
  it("red-flags a balance the entries don't explain", () => {
    const short = { ...transactions, "0450-0001": [] };
    const w = computeWorkpapers({ key: "4500", year: 2025, asOfMonth: 12, gl, transactions: short });
    expect(w.schedules.find((s) => s.code === "0450-0001")!.unexplained).toBeCloseTo(-23391.4, 2);
  });
  it("a mortgage off the lender schedule is red", () => {
    const w = computeWorkpapers({ key: "4500", year: 2025, asOfMonth: 12, gl, transactions, sources: { debtPrincipal: { amount: 7900000, loans: 1 } } });
    expect(w.schedules.find((s) => s.code === "2740-0000")!.status).toBe("fix");
  });
});

describe("possibleDuplicates", () => {
  it("ignores a recurring monthly entry", () => {
    const lines = [1, 2, 3, 4].map((mo) => ({ date: `2025-0${mo}-01`, month: mo, description: "Amort-def'd mtge", ref: "", amount: -2749 }));
    expect(possibleDuplicates(lines)).toHaveLength(0);
  });
});

describe("kindOf", () => {
  it("knows the workpaper accounts", () => {
    expect(kindOf("0300-0000")).toBe("suspense");
    expect(kindOf("0450-0002")).toBe("unbilled");
    expect(kindOf("1940-0000")).toBe("accumDep");
    expect(kindOf("2430-0000")).toBe("taxPayable");
    expect(kindOf("2740-8501")).toBe("mortgage");
    expect(kindOf("9990-0000")).toBe("clearing");
    expect(kindOf("4230-8501")).toBeNull();
  });
});
