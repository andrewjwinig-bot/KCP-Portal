import { describe, it, expect } from "vitest";
import { recoveryOnlyLeases } from "./draft";

const z = () => new Array(12).fill(0);
const row = (unitRef: string, tenant: string, recoveryOnly = false) =>
  ({ unitRef, tenant, sqft: 0, status: "contracted", rent: z(), cam: z(), ins: z(), ret: z(), assumed: z().map(() => false), recoveryOnly }) as any;

describe("recoveryOnlyLeases", () => {
  it("offers a recon tenant on no rent-roll suite as a lease in place, carrying its back-out", () => {
    const out = recoveryOnlyLeases(
      [row("7010-100", "On The Roll"), row("7010-12349", "North Inc", true)],
      { "7010-12349": { kind: "stop", startMonth: 1 } } as any,
      [{ unitRef: "7010-100", tenant: "On The Roll", sqft: 1000, monthlyRent: 1 }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ unitRef: "7010-12349", tenant: "North Inc", assumption: { kind: "stop" } });
  });
});
