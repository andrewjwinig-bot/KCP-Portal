import { describe, it, expect } from "vitest";
import { validateClarify } from "./clarify";

describe("validateClarify", () => {
  it("accepts a real question with clickable options", () => {
    expect(validateClarify({ question: "Which years?", options: ["2023-2025", "Every year we have"] }))
      .toEqual({ question: "Which years?", options: ["2023-2025", "Every year we have"] });
  });

  it("rejects a question with fewer than two options", () => {
    // One option is not a choice, and a question with nothing to click leaves
    // the user's only move as retyping — which is the cost this exists to remove.
    expect(validateClarify({ question: "Which years?", options: ["2025"] })).toBeNull();
    expect(validateClarify({ question: "Which years?" })).toBeNull();
  });

  it("drops duplicate options rather than rendering a dead click", () => {
    const out = validateClarify({ question: "Which years?", options: ["2025", "2025 ", "All years"] });
    expect(out?.options).toEqual(["2025", "All years"]);
  });

  it("caps at four options", () => {
    const out = validateClarify({ question: "Which?", options: ["a", "b", "c", "d", "e"] });
    expect(out?.options).toHaveLength(4);
  });

  it("rejects anything that isn't a question", () => {
    expect(validateClarify(null)).toBeNull();
    expect(validateClarify("which years?")).toBeNull();
    expect(validateClarify({ question: "hm", options: ["a", "b"] })).toBeNull();
  });
});
