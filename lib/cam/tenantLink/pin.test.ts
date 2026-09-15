import { describe, expect, it } from "vitest";
import { generatePin, pinsMatch, signPinCookie, verifyPinCookie } from "./pin";

const SECRET = "test-link-secret-0123456789";

describe("generatePin", () => {
  it("is always a 6-digit numeric string", () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePin();
      expect(p).toMatch(/^\d{6}$/);
    }
  });
});

describe("pinsMatch", () => {
  it("matches identical PINs", () => {
    expect(pinsMatch("482913", "482913")).toBe(true);
  });
  it("rejects a wrong PIN", () => {
    expect(pinsMatch("482913", "482914")).toBe(false);
  });
  it("rejects differing lengths (no prefix match)", () => {
    expect(pinsMatch("482913", "4829")).toBe(false);
    expect(pinsMatch("4829", "482913")).toBe(false);
  });
  it("never matches empty against empty", () => {
    expect(pinsMatch("", "")).toBe(false);
  });
});

describe("PIN cookie", () => {
  it("round-trips a freshly signed cookie for its link", () => {
    const { value } = signPinCookie(SECRET, "tl_abc");
    expect(verifyPinCookie(value, SECRET, "tl_abc")).toBe(true);
  });
  it("rejects a cookie bound to a different link id", () => {
    const { value } = signPinCookie(SECRET, "tl_abc");
    expect(verifyPinCookie(value, SECRET, "tl_other")).toBe(false);
  });
  it("rejects a cookie signed with a different secret", () => {
    const { value } = signPinCookie(SECRET, "tl_abc");
    expect(verifyPinCookie(value, "another-secret", "tl_abc")).toBe(false);
  });
  it("rejects a tampered signature", () => {
    const { value } = signPinCookie(SECRET, "tl_abc");
    const tampered = value.slice(0, -2) + (value.endsWith("aa") ? "bb" : "aa");
    expect(verifyPinCookie(tampered, SECRET, "tl_abc")).toBe(false);
  });
  it("rejects a cookie whose embedded expiry has passed", () => {
    // Hand-craft a body with a past exp, but with a VALID signature — proves the
    // expiry itself is enforced (not just the signature).
    const crypto = require("crypto") as typeof import("crypto");
    const body = `tl_abc.${Math.floor(Date.now() / 1000) - 60}`;
    const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
    expect(verifyPinCookie(`${body}.${sig}`, SECRET, "tl_abc")).toBe(false);
  });
  it("rejects malformed / empty cookies", () => {
    expect(verifyPinCookie(undefined, SECRET, "tl_abc")).toBe(false);
    expect(verifyPinCookie("", SECRET, "tl_abc")).toBe(false);
    expect(verifyPinCookie("garbage", SECRET, "tl_abc")).toBe(false);
    expect(verifyPinCookie("a.b", SECRET, "tl_abc")).toBe(false);
  });
});
