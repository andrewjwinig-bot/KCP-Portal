import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory storage so the test never touches disk or Blob.
const mem = new Map<string, any>();
vi.mock("@/lib/storage", () => ({
  getJSON: async (prefix: string, id: string) => mem.get(`${prefix}/${id}`) ?? null,
  storeJSON: async (prefix: string, id: string, v: any) => { mem.set(`${prefix}/${id}`, v); },
  listJSON: async (prefix: string) => [...mem.entries()].filter(([k]) => k.startsWith(prefix + "/")).map(([, v]) => v),
}));

import { checkPassword, issueTemporaryPassword, setPassword } from "./passwordStore";
import { passwordProblem } from "./passwordPolicy";

beforeEach(() => {
  mem.clear();
  process.env.SITE_PASSWORD = "shared-staff-pass";
  process.env.HISTORY_PASSWORD = "admin-tier-pass";
});

describe("checkPassword", () => {
  it("falls back to the shared tier password when the user has none of their own", async () => {
    expect((await checkPassword("nancy", "shared-staff-pass", { adminTier: false })).ok).toBe(true);
    expect((await checkPassword("drew", "admin-tier-pass", { adminTier: true })).ok).toBe(true);
    expect((await checkPassword("nancy", "admin-tier-pass", { adminTier: false })).ok).toBe(false);
  });

  it("once a user sets their own, ONLY theirs works — the shared one stops", async () => {
    await setPassword("nancy", "blue heron at dawn", { by: "nancy" });
    expect((await checkPassword("nancy", "blue heron at dawn", { adminTier: false })).ok).toBe(true);
    expect((await checkPassword("nancy", "shared-staff-pass", { adminTier: false })).ok).toBe(false);
    // Nobody else is affected.
    expect((await checkPassword("harry", "shared-staff-pass", { adminTier: false })).ok).toBe(true);
  });

  it("stores a hash, never the password", async () => {
    await setPassword("tami", "quiet river stones", { by: "tami" });
    const rec = mem.get("user-passwords/tami");
    expect(rec.hash).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(JSON.stringify(rec)).not.toContain("quiet river stones");
  });

  it("a one-time password signs in but says it must be changed", async () => {
    const temp = await issueTemporaryPassword("randy", "drew");
    const r = await checkPassword("randy", temp, { adminTier: false });
    expect(r).toMatchObject({ ok: true, mustChange: true, source: "portal" });
  });
});

describe("passwordProblem", () => {
  it("holds the floor and refuses the obvious", () => {
    expect(passwordProblem("short", { userId: "randy" })).toMatch(/at least 10/);
    expect(passwordProblem("Password!!", { userId: "randy" })).toMatch(/easy to guess/);
    expect(passwordProblem("randy12345", { userId: "randy" })).toMatch(/own name/);
    expect(passwordProblem("blue heron at dawn", { userId: "randy", current: "blue heron at dawn" })).toMatch(/different/);
    expect(passwordProblem("blue heron at dawn", { userId: "randy" })).toBeNull();
  });
});
