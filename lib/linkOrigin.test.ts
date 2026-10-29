import { describe, it, expect, afterEach } from "vitest";
import { linkOrigin } from "./linkOrigin";

const req = (host = "kcp-portal.vercel.app", proto = "https") =>
  ({
    headers: new Headers({ host, "x-forwarded-proto": proto }),
    nextUrl: { host },
  }) as any;

afterEach(() => { delete process.env.PORTAL_ORIGIN; });

describe("linkOrigin", () => {
  it("falls back to the request host when nothing is pinned", () => {
    expect(linkOrigin(req())).toBe("https://kcp-portal.vercel.app");
  });

  it("pins the host regardless of which deployment mints the link", () => {
    process.env.PORTAL_ORIGIN = "https://portal.kormancommercial.com";
    // A preview deployment must still mint the real link.
    expect(linkOrigin(req("kcp-portal-abc123.vercel.app"))).toBe("https://portal.kormancommercial.com");
  });

  it("tolerates a bare hostname and a trailing slash", () => {
    process.env.PORTAL_ORIGIN = "portal.kormancommercial.com/";
    expect(linkOrigin(req())).toBe("https://portal.kormancommercial.com");
  });

  it("ignores an empty or whitespace value rather than minting '://'", () => {
    process.env.PORTAL_ORIGIN = "   ";
    expect(linkOrigin(req("example.com"))).toBe("https://example.com");
  });

  it("keeps http for local development", () => {
    process.env.PORTAL_ORIGIN = "http://localhost:3000";
    expect(linkOrigin(req())).toBe("http://localhost:3000");
  });
});
