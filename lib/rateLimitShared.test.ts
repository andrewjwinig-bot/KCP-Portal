import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const store = new Map<string, string>();
vi.mock("@vercel/blob", () => ({
  get: async (p: string) => (store.has(p) ? { statusCode: 200, stream: new Response(store.get(p)).body } : null),
  put: async (p: string, body: string) => { store.set(p, body); return {}; },
}));
import { checkSharedRateLimit, rateLimitPath } from "./rate-limit";

describe("shared rate limit", () => {
  it("counts in the shared store and refuses past the limit", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "x";
    for (let i = 0; i < 3; i++) expect(await checkSharedRateLimit("login:1.2.3.4", 3)).toBe(true);
    expect(await checkSharedRateLimit("login:1.2.3.4", 3)).toBe(false);
  });
  it("another instance's count is honoured", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "x";
    store.set(rateLimitPath("pin:abc", Date.now()), JSON.stringify({ count: 10 }));
    expect(await checkSharedRateLimit("pin:abc", 10)).toBe(false);
  });
  it("never stores the raw key", () => {
    expect(rateLimitPath("site-login:1.2.3.4", 0)).not.toContain("1.2.3.4");
  });
});
