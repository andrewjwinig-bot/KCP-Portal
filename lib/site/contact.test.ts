import { describe, it, expect } from "vitest";
import { checkContact, contactRecipients, CONTACT_TO_DEFAULT } from "./contact";

describe("website contact form", () => {
  it("accepts a complete message", () => {
    const r = checkContact({ name: " Ann ", email: "ann@example.com", message: "Hello", website: "" });
    expect(r).toEqual({ ok: true, spam: false, value: { name: "Ann", email: "ann@example.com", message: "Hello" } });
  });

  it("drops a filled honeypot as spam, whatever else is missing", () => {
    const r = checkContact({ website: "http://spam.example" });
    expect(r.ok && r.spam).toBe(true);
  });

  it("refuses a missing name, a bad email and an empty message", () => {
    expect(checkContact({ email: "a@b.co", message: "x" })).toEqual({ ok: false, error: "Please enter your name." });
    expect(checkContact({ name: "A", email: "nope", message: "x" })).toMatchObject({ ok: false });
    expect(checkContact({ name: "A", email: "a@b.co", message: "  " })).toEqual({ ok: false, error: "Please enter a message." });
  });

  it("mails info@ unless SITE_CONTACT_TO says otherwise", () => {
    expect(contactRecipients(undefined)).toEqual([CONTACT_TO_DEFAULT]);
    expect(contactRecipients(" a@x.com, b@x.com ")).toEqual(["a@x.com", "b@x.com"]);
  });
});
