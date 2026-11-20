import { describe, expect, it } from "vitest";
import { withoutTypedSignature } from "./confirmationEmail";

describe("a typed sign-off is not printed twice", () => {
  it("drops the name and company under Thanks, keeps the closing", () => {
    expect(withoutTypedSignature("Hi Scott,\n\nThe heat is on.\n\nThanks,\nJay\nKorman Commercial Operations\n", "Jay"))
      .toBe("Hi Scott,\n\nThe heat is on.\n\nThanks,");
    expect(withoutTypedSignature("Approved.\n\nThanks,\nGreg Masciantonio\nKCP Property Management", "Greg Masciantonio"))
      .toBe("Approved.\n\nThanks,");
  });
  it("leaves a body that does not end in a sign-off alone", () => {
    expect(withoutTypedSignature("Jay will be there at 9.\n\nThanks,", "Jay")).toBe("Jay will be there at 9.\n\nThanks,");
    expect(withoutTypedSignature("Jay", "Jay")).toBe("Jay");
  });
});
