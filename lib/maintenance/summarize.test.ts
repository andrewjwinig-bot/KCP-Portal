import { describe, expect, it } from "vitest";
import { summarize } from "./summarize";

describe("summarize", () => {
  it("strips filler and title-cases", () => {
    expect(summarize("my toilet is leaking")).toBe("Toilet Leaking");
    expect(summarize("no power in the suite please help")).toBe("No Power Suite Help");
    expect(summarize("the elevator is stuck on the 3rd floor")).toBe("Elevator Stuck 3rd Floor");
  });

  it("caps at the word limit", () => {
    expect(summarize("light bulbs out in conference room a near front desk").split(" ").length)
      .toBeLessThanOrEqual(6);
  });

  it("uses only the first sentence", () => {
    expect(summarize("Toilet is leaking. Please come fix today.")).toBe("Toilet Leaking");
  });

  it("handles short numeric tokens", () => {
    expect(summarize("AC broken on floor 3").includes("3")).toBe(true);
  });

  it("returns empty for empty input", () => {
    expect(summarize("")).toBe("");
    expect(summarize("   ")).toBe("");
  });

  it("falls back to truncated original when nothing survives the filter", () => {
    // All stop words → fall back to first 40 chars of the first line
    expect(summarize("the on and at to")).toBe("the on and at to");
  });

  it("handles punctuation around tokens", () => {
    expect(summarize("Hello, my toilet — is leaking!")).toBe("Toilet Leaking");
  });

  it("respects a custom max", () => {
    expect(summarize("toilet leaking in suite 200", 2)).toBe("Toilet Leaking");
  });
});
