import { describe, it, expect } from "vitest";
import { batchCounts, buildItems, willSend, type AccountIn } from "./reminderBatch";
import type { Account } from "./receiptMatch";
import { creditSummaryDay, isBusinessDay, nextMonthOf } from "./reminderSchedule";
import { signCreditApplyToken, verifyCreditApplyToken } from "./creditApplyLink";

const acct = (gross: number, credit = 0): Account => ({
  charges: gross ? [{ idx: 0, dateISO: "2026-11-01", description: "Base Rent", category: "rent" as never, appClass: "rent" as never, amount: gross }] : [],
  creditLines: credit ? [{ dateISO: null, description: "Open Credits", amount: credit }] : [], gross, credit, net: gross - credit,
});
const a = (unitRef: string, ac: Account, recipients = ["t@x.com"]): AccountIn => ({
  unitRef, propertyCode: "7010", propertyName: "Parkwood", tenantName: unitRef, suite: "1", acct: ac, period: "2026-11", asOf: "2026-11-15", monthlyCharges: 1000, recipients,
});

describe("the month's batch", () => {
  it("ticks everyone by default, skips former occupants and accounts with nothing to say", () => {
    const items = buildItems([a("7010-1", acct(500)), a("7010-2-FO", acct(500)), a("7010-3", acct(0)), a("7010-4", acct(100, 900))]);
    expect(items.map((i) => i.unitRef)).toEqual(["7010-1", "7010-4"]);
    expect(items.every((i) => i.send)).toBe(true);
    expect(items[1].tier).toBe("credit");
  });
  it("a suite with no email is listed but cannot send", () => {
    const [i] = buildItems([a("7010-1", acct(500), [])]);
    expect(i.blocked).toBe("No email on file");
    expect(willSend(i)).toBe(false);
    expect(batchCounts([i]).blocked).toBe(1);
  });
  it("a rebuild keeps Greg's unticks and anything already sent", () => {
    const first = buildItems([a("7010-1", acct(500)), a("7010-2", acct(700))]);
    first[0].send = false;
    first[1].status = "sent";
    const again = buildItems([a("7010-1", acct(550)), a("7010-2", acct(10))], first);
    expect(again[0].send).toBe(false);
    expect(again[0].acct.gross).toBe(550);
    expect(again[1]).toBe(first[1]);
  });
});

describe("the calendar", () => {
  it("the summary goes the business day before the 25th", () => {
    expect(creditSummaryDay("2026-12")).toBe("2026-12-23"); // the 24th is a holiday
    expect(creditSummaryDay("2027-01")).toBe("2027-01-22"); // the 25th is a Monday → Friday
    expect(creditSummaryDay("2026-11")).toBe("2026-11-24");
    expect(creditSummaryDay("2027-11")).toBe("2027-11-24");
    expect(isBusinessDay("2026-11-26")).toBe(false); // Thanksgiving
    expect(nextMonthOf("2026-12")).toBe("2027-01");
  });
});

describe("the apply-my-credit link", () => {
  it("round-trips, and nothing else signed with the same secret opens it", async () => {
    const t = await signCreditApplyToken("s3cret", "7010-12321", "2026-11");
    expect(await verifyCreditApplyToken(t, "s3cret")).toEqual({ v: 1, u: "7010-12321", m: "2026-11" });
    expect(await verifyCreditApplyToken(t, "other")).toBeNull();
    const [body] = t.split(".");
    expect(await verifyCreditApplyToken(`${body}.AAAA`, "s3cret")).toBeNull();
  });
});

import { addBusinessDays } from "./reminderSchedule";
describe("if Greg forgets", () => {
  it("built Monday Nov 16: reminder Tuesday, sends itself Wednesday; a Friday build sends Tuesday", () => {
    expect(addBusinessDays("2026-11-16", 1)).toBe("2026-11-17");
    expect(addBusinessDays("2026-11-16", 2)).toBe("2026-11-18");
    expect(addBusinessDays("2026-11-20", 2)).toBe("2026-11-24");
    expect(addBusinessDays("2026-11-25", 1)).toBe("2026-11-30"); // over Thanksgiving
  });
});
