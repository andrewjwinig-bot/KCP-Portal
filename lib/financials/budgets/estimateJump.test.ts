import { describe, expect, it } from "vitest";
import { estimateJump, monthlyEstimate } from "./estimateJump";

const flat = (v: number) => new Array(12).fill(v);
const row = (cam: number, ins: number, ret: number, billing?: { cam: number; ins: number; ret: number }) =>
  ({ cam: flat(cam), ins: flat(ins), ret: flat(ret), billing });

describe("estimateJump", () => {
  it("flags a combined rise over both floors", () => {
    const j = estimateJump(row(1400, 100, 500, { cam: 1000, ins: 100, ret: 500 }))!;
    expect(j.now).toBe(1600);
    expect(j.next).toBe(2000);
    expect(j.changeDollars).toBe(400);
    expect(j.changePct).toBeCloseTo(25);
  });
  it("ignores a big percent on a small escrow", () => {
    expect(estimateJump(row(90, 0, 0, { cam: 50, ins: 0, ret: 0 }))).toBeNull();
  });
  it("ignores real dollars that are a small percent", () => {
    expect(estimateJump(row(9150, 0, 0, { cam: 9000, ins: 0, ret: 0 }))).toBeNull();
  });
  it("never flags a decrease", () => {
    expect(estimateJump(row(500, 0, 0, { cam: 1000, ins: 0, ret: 0 }))).toBeNull();
  });
  it("needs a today to compare against", () => {
    expect(estimateJump(row(1000, 0, 0))).toBeNull();
    expect(estimateJump(row(1000, 0, 0, { cam: 0, ins: 0, ret: 0 }))).toBeNull();
  });
  it("averages only the months a lease is billed", () => {
    expect(monthlyEstimate([500, 500, 500, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(500);
  });
});
