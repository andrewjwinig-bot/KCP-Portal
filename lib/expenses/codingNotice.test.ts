import { describe, expect, it } from "vitest";
import { chargesFor, codingNoticeEmail } from "./codingNotice";

const t = (cardMember: string, amount: number, description = "HOME DEPOT") => ({
  id: `${cardMember}-${amount}`, date: "2026-11-03", cardMember, description, amount, category: "", propertyId: "", suite: "", codedDescription: "",
});

describe("codingNoticeEmail", () => {
  it("itemizes only Greg's charges, with the total and the link to his page", () => {
    const tx = [t("GREG MASCIANTONIO", 45.5, "LOWES #123"), t("HARRY FELDMAN", 99, "STAPLES"), t("GREG MASCIANTONIO", 10)];
    const mine = chargesFor("greg", tx);
    expect(mine).toHaveLength(2);
    const e = codingNoticeEmail("greg", mine, "Nov 2026", "Harry");
    expect(e.subject).toBe("2 credit card charges to code · Nov 2026");
    expect(e.html).toContain("LOWES #123");
    expect(e.html).toContain("$55.50");
    expect(e.html).toContain("/expenses/mine");
    expect(e.text).not.toContain("STAPLES");
  });
});
