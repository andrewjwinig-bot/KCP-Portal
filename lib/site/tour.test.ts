import { describe, expect, it } from "vitest";
import { checkTour, tourEmailText } from "./tour";

describe("Office Works tour request", () => {
  it("needs a name and a valid email", () => {
    expect(checkTour({ email: "a@b.co" })).toMatchObject({ ok: false });
    expect(checkTour({ name: "Pat", email: "nope" })).toMatchObject({ ok: false });
    expect(checkTour({ name: "Pat", email: "pat@firm.com" })).toMatchObject({ ok: true, spam: false });
  });
  it("drops a filled honeypot without saying so", () => {
    expect(checkTour({ name: "x", email: "x", website: "spam.biz" })).toMatchObject({ ok: true, spam: true });
  });
  it("keeps only a known program and a real date", () => {
    const c = checkTour({ name: "Pat", email: "pat@firm.com", program: "<b>", date: "tomorrow" });
    expect(c.ok && c.value).toMatchObject({ program: "Private office", date: "" });
  });
  it("writes the request the front desk reads", () => {
    const c = checkTour({ name: "Pat Lee", email: "pat@firm.com", program: "Virtual office", office: "5-019", date: "2026-11-03", company: "Lee LLC" });
    const text = c.ok ? tourEmailText(c.value) : "";
    expect(text).toContain("Program:         Virtual office");
    expect(text).toContain("Office:          Office 5-019");
    expect(text).toContain("Tuesday, November 3, 2026");
    expect(text).toContain("Company:  Lee LLC");
    expect(text).not.toContain("Phone:");
  });
});
