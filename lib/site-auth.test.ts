import { describe, it, expect } from "vitest";
import { signSiteToken, verifySiteToken, verifySiteTokenFull } from "./site-auth";

const secret = "unit-test-secret-value";

describe("site token", () => {
  it("round-trips a normal session", async () => {
    const { value } = await signSiteToken(secret, "nancy");
    expect(await verifySiteToken(value, secret)).toBe("nancy");
    expect(await verifySiteTokenFull(value, secret)).toEqual({ userId: "nancy", enrollPending: false, passwordPending: false });
  });

  it("round-trips an enroll-pending session", async () => {
    const { value } = await signSiteToken(secret, "alison", true);
    const full = await verifySiteTokenFull(value, secret);
    expect(full).toEqual({ userId: "alison", enrollPending: true, passwordPending: false });
  });

  it("rejects a tampered token and a wrong secret", async () => {
    const { value } = await signSiteToken(secret, "harry");
    expect(await verifySiteToken(value.slice(0, -2) + "xy", secret)).toBeNull();
    expect(await verifySiteToken(value, "other-secret")).toBeNull();
    expect(await verifySiteToken("a.b.c", secret)).toBeNull();
  });

  it("an enroll-pending token can't be passed off as a normal one (sig binds the flag)", async () => {
    const { value } = await signSiteToken(secret, "alison", true);
    // Strip the "enroll" flag segment → signature no longer matches.
    const parts = value.split(".");
    const forged = `${parts[0]}.${parts[1]}.${parts[3]}`;
    expect(await verifySiteToken(forged, secret)).toBeNull();
  });

  it("carries a must-choose-a-password flag, alone or with 2FA", async () => {
    const pw = await signSiteToken(secret, "randy", false, true);
    expect(await verifySiteTokenFull(pw.value, secret)).toEqual({ userId: "randy", enrollPending: false, passwordPending: true });
    const both = await signSiteToken(secret, "randy", true, true);
    expect(await verifySiteTokenFull(both.value, secret)).toEqual({ userId: "randy", enrollPending: true, passwordPending: true });
    // Stripping the flag breaks the signature — a pending session can't be upgraded.
    const parts = pw.value.split(".");
    expect(await verifySiteToken(`${parts[0]}.${parts[1]}.${parts[3]}`, secret)).toBeNull();
  });
});
