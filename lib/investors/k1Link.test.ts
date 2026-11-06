import { describe, expect, it } from "vitest";
import { signTenantToken, verifyTenantToken } from "@/lib/cam/tenantLink/token";
import { signInvestorToken, verifyInvestorToken } from "./k1Link";

// Both modules fall back to SITE_AUTH_SECRET when no dedicated secret is set,
// so they can end up signing with the same key. Domain separation is what stops
// a tenant's token from opening an investor's K-1 in that case.
const SHARED = "shared-site-secret";
const tenant = () => signTenantToken(SHARED, { v: 1, id: "tl_x", p: "1100", u: "1100-34", y: 2025, k: "retail" });
const investor = () => signInvestorToken(SHARED, { v: 1, id: "il_x", o: "own-7010-akgst", p: "7010" });

describe("investor tokens are domain-separated from tenant tokens", () => {
  it("each verifies on its own surface", async () => {
    expect(await verifyTenantToken(await tenant(), SHARED)).toMatchObject({ u: "1100-34" });
    expect(await verifyInvestorToken(await investor(), SHARED)).toMatchObject({ o: "own-7010-akgst" });
  });

  it("a tenant token cannot open the investor portal", async () => {
    expect(await verifyInvestorToken(await tenant(), SHARED)).toBeNull();
  });

  it("an investor token cannot open the tenant portal", async () => {
    expect(await verifyTenantToken(await investor(), SHARED)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    expect(await verifyInvestorToken(await investor(), "some-other-secret")).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    // Swap the owner id in the body and keep the original signature.
    const tok = await investor();
    const [body, sig] = tok.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    payload.o = "own-7010-alis1";
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
    expect(await verifyInvestorToken(forged, SHARED)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await signInvestorToken(SHARED, {
      v: 1, id: "il_x", o: "own-7010-akgst", p: "7010", exp: Math.floor(Date.now() / 1000) - 60,
    });
    expect(await verifyInvestorToken(expired, SHARED)).toBeNull();
  });
});
