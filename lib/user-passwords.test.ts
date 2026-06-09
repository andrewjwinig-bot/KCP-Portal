import { describe, it, expect, beforeAll } from "vitest";
import { scryptSync, randomBytes } from "crypto";

let verifyUserPassword: (u: string, p: string) => boolean | null;
let perUserConfigured: () => boolean;

beforeAll(async () => {
  const salt = randomBytes(16);
  const hash = scryptSync("harry-pw", salt, 32);
  process.env.SITE_USER_PASSWORDS = JSON.stringify({
    nancy: "nancy-pw", // plaintext entry
    harry: `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`, // hashed entry
  });
  ({ verifyUserPassword, perUserConfigured } = await import("@/lib/user-passwords"));
});

describe("per-user passwords", () => {
  it("reports configured", () => { expect(perUserConfigured()).toBe(true); });
  it("verifies a plaintext entry", () => {
    expect(verifyUserPassword("nancy", "nancy-pw")).toBe(true);
    expect(verifyUserPassword("nancy", "wrong")).toBe(false);
    expect(verifyUserPassword("nancy", "")).toBe(false);
  });
  it("verifies a scrypt-hashed entry", () => {
    expect(verifyUserPassword("harry", "harry-pw")).toBe(true);
    expect(verifyUserPassword("harry", "nope")).toBe(false);
  });
  it("returns null for a user with no per-user credential (caller falls back)", () => {
    expect(verifyUserPassword("marie", "anything")).toBeNull();
  });
});
