import { describe, expect, it } from "vitest";
import { signCommissionReviewToken, verifyCommissionReviewToken } from "./reviewLink";

describe("commission review link", () => {
  it("round-trips the quarter and refuses a tampered or foreign token", async () => {
    const t = await signCommissionReviewToken("s", "3rd Quarter 2026");
    expect(await verifyCommissionReviewToken(t, "s")).toBe("3rd Quarter 2026");
    expect(await verifyCommissionReviewToken(t, "other")).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, q: "4th Quarter 2026" })).toString("base64url");
    expect(await verifyCommissionReviewToken(`${forged}.${sig}`, "s")).toBeNull();
    expect(await verifyCommissionReviewToken(body, "s")).toBeNull();
  });
});

describe("review link expiry", () => {
  it("opens for 60 days, then not", async () => {
    const { signCommissionReviewToken, verifyCommissionReviewToken } = await import("./reviewLink");
    const t0 = Date.parse("2026-11-24T12:00:00Z");
    const tok = await signCommissionReviewToken("s3cret", "Q3 26", t0);
    expect(await verifyCommissionReviewToken(tok, "s3cret", t0 + 59 * 86_400_000)).toBe("Q3 26");
    expect(await verifyCommissionReviewToken(tok, "s3cret", t0 + 61 * 86_400_000)).toBeNull();
  });
});
