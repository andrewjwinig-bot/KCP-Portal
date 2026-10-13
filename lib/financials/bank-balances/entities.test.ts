import { describe, it, expect } from "vitest";
import { BALANCE_ACCOUNTS, entityFor, accountId } from "./entities";

describe("bank balance entities", () => {
  it("every account lands on exactly one line, and no account is listed twice", () => {
    const ids = BALANCE_ACCOUNTS.map((a) => accountId(a.bank, a.last4));
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of BALANCE_ACCOUNTS) expect(entityFor(a).key).toBeTruthy();
  });
  it("pools the funds and restricts the security deposits", () => {
    const by = (l: string) => entityFor(BALANCE_ACCOUNTS.find((a) => a.last4 === l)!);
    expect(by("x5631").key).toBe("PJV3");
    expect(by("x2190").key).toBe("PNIPLX");
    expect(by("x7448").restricted).toBe(true);
    expect(by("x7216").restricted).toBe(true);
    expect(by("x8276").restricted).toBe(true); // LIK Management (SD) money market — deposits (owner)
    expect(by("x6088")).toMatchObject({ key: "9500LH", group: "Land & Other" }); // not 9510's operating account
    expect(by("x5303").key).toBe(by("x4031").key); // Eastwick at Chase and M&T
  });
});
