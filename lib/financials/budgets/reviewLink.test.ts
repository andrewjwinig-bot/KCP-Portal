import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/collectionStore", () => ({ createCollectionStore: () => ({ get: async () => null, all: async () => [], set: async () => {}, remove: async () => {} }) }));

import { signReviewToken, verifyReviewToken } from "./reviewLink";
import { signInvestorToken } from "@/lib/investors/k1Link";

const SECRET = "test-secret";

describe("review link tokens", () => {
  it("round-trips a signed payload", async () => {
    const t = await signReviewToken(SECRET, { v: 1, id: "abc", u: "harry", g: "SC", y: 2027 });
    expect(await verifyReviewToken(t, SECRET)).toEqual({ v: 1, id: "abc", u: "harry", g: "SC", y: 2027 });
  });

  it("refuses a tampered payload and the wrong secret", async () => {
    const t = await signReviewToken(SECRET, { v: 1, id: "abc", u: "harry", g: "SC", y: 2027 });
    const [, sig] = t.split(".");
    const forged = `${Buffer.from(JSON.stringify({ v: 1, id: "abc", u: "harry", g: "BP", y: 2027 })).toString("base64url")}.${sig}`;
    expect(await verifyReviewToken(forged, SECRET)).toBeNull();
    expect(await verifyReviewToken(t, "other-secret")).toBeNull();
  });

  it("is domain-separated: an investor K-1 token never opens a review", async () => {
    const k1 = await signInvestorToken(SECRET, { v: 1, id: "abc", o: "harry", p: "SC" } as never);
    expect(await verifyReviewToken(k1, SECRET)).toBeNull();
  });
});
