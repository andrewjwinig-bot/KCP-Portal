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
    expect(by("x1622")).toMatchObject({ key: "2010-CLR", name: "LIK Clearing", group: "Management" });
    expect("2010-CLR".localeCompare("2010")).toBeGreaterThan(0); // sorts under LIK Management
    expect(by("x6088").key).toBe("9510"); // 9500 LH LLC reads on 9510 (owner)
    expect(by("x8276")).toMatchObject({ key: "SD-x7216", name: "Security Deposits — All but NI LLC" });
    expect(by("x6127").key).toBe("2070");
    expect(by("x6119")).toMatchObject({ key: "2070", name: "Kosano Associates LP (Nockamixon)" });
    expect(by("x5303").key).toBe(by("x4031").key); // Eastwick at Chase and M&T
  });
});
