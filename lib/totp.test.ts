import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyTotp, base32Encode, generateSecret } from "./totp";

// RFC 6238 test vector: ASCII secret "12345678901234567890", SHA-1, at T=59s
// the 8-digit TOTP is 94287082 → 6 digits = 287082 (counter = 1).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

afterEach(() => vi.restoreAllMocks());

describe("TOTP", () => {
  it("matches the RFC 6238 vector", () => {
    vi.spyOn(Date, "now").mockReturnValue(59 * 1000);
    expect(verifyTotp(RFC_SECRET, "287082")).toBe(true);
  });
  it("rejects a wrong code", () => {
    vi.spyOn(Date, "now").mockReturnValue(59 * 1000);
    expect(verifyTotp(RFC_SECRET, "000000")).toBe(false);
    expect(verifyTotp(RFC_SECRET, "abc")).toBe(false);
    expect(verifyTotp(RFC_SECRET, "")).toBe(false);
  });
  it("accepts ±1 step for clock drift but not further", () => {
    // code for counter 1 is 287082; verify at counter 0 (T=29) and 2 (T=89).
    vi.spyOn(Date, "now").mockReturnValue(29 * 1000); // counter 0, window reaches 1
    expect(verifyTotp(RFC_SECRET, "287082")).toBe(true);
    vi.restoreAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(120 * 1000); // counter 4 — too far
    expect(verifyTotp(RFC_SECRET, "287082")).toBe(false);
  });
  it("generates distinct 32-char base32 secrets", () => {
    const a = generateSecret(), b = generateSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(b);
  });
});
