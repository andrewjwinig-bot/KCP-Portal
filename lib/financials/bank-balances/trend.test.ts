import { describe, expect, it } from "vitest";
import { balanceLineFor, balanceTrend } from "./trend";
import { BALANCE_ACCOUNTS, accountId, entityFor } from "./entities";

describe("bank balance trend", () => {
  it("a fund building reads its fund's line", () => {
    expect(balanceLineFor("3620")?.key).toBe("PJV3");
    expect(balanceLineFor("7010")?.key).toBe("7010");
  });
  it("each date carries every account's newest figure; a date waits until all have one", () => {
    const line = balanceLineFor("7010")!;
    const ids = BALANCE_ACCOUNTS.filter((a) => entityFor(a).key === line.key).map((a) => accountId(a.bank, a.last4));
    const snap = (date: string, vals: number[]) => ({ date, accounts: Object.fromEntries(ids.map((id, i) => [id, { balance: vals[i] ?? 0, asOf: date }])) });
    const t = balanceTrend("7010", [snap("2026-10-12", ids.map(() => 100)), snap("2026-10-05", ids.map(() => 50))])!;
    expect(t.points.map((p) => p.date)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(t.points[1].balance).toBe(100 * ids.length);
    // a later snapshot carrying only one account keeps the others' last figure
    const t2 = balanceTrend("7010", [snap("2026-10-05", ids.map(() => 50)), { date: "2026-10-19", accounts: { [ids[0]]: { balance: 80, asOf: "2026-10-19" } } }])!;
    expect(t2.points[t2.points.length - 1].balance).toBe(80 + 50 * (ids.length - 1));
  });
});
