import { describe, expect, it } from "vitest";
import { checkLeasing, leasingEmailText, leasingRecipients } from "./leasing";

describe("Interplex leasing inquiry", () => {
  it("goes to Nancy unless overridden", () => {
    expect(leasingRecipients("")).toEqual(["nfox@kormancommercial.com"]);
    expect(leasingRecipients("a@x.com, b@x.com")).toEqual(["a@x.com", "b@x.com"]);
  });
  it("needs a name and a real email; a filled honeypot is dropped quietly", () => {
    expect(checkLeasing({ name: "", email: "a@b.co" }).ok).toBe(false);
    expect(checkLeasing({ name: "Ann", email: "nope" }).ok).toBe(false);
    const spam = checkLeasing({ name: "Ann", email: "a@b.co", website: "x" });
    expect(spam.ok && spam.spam).toBe(true);
  });
  it("writes the inquiry out for the email", () => {
    const c = checkLeasing({ name: "Ann", email: "a@b.co", size: "2,500–5,000 SF", building: "Building Eight", notes: "Q1 move" });
    if (!c.ok) throw new Error("expected ok");
    const text = leasingEmailText(c.value);
    expect(text).toContain("Building:      Building Eight");
    expect(text).toContain("Q1 move");
  });
});
