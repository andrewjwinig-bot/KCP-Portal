import { describe, it, expect } from "vitest";
import { creditPlan, creditSchedule, monthlyReminderParts, oldestChargeMonths, openAfterCredit, renderCreditAppliedEmail, renderMonthlyReminder, tierOf } from "./monthlyReminder";
import { applicationClassOf, type Account } from "./receiptMatch";

let n = 0;
const ch = (dateISO: string, description: string, amount: number) => ({ idx: n++, dateISO, description, category: "other" as never, appClass: applicationClassOf({ description, category: "other" as never }), amount });
const acct = (charges: ReturnType<typeof ch>[], credits: { dateISO: string | null; description: string; amount: number }[] = []): Account => {
  const gross = charges.reduce((a, x) => a + x.amount, 0), credit = credits.reduce((a, x) => a + x.amount, 0);
  return { charges, creditLines: credits, gross, credit, net: Math.round((gross - credit) * 100) / 100 };
};
const base = { tenantName: "Sample Co", propertyName: "Parkwood Shopping Center", propertyCode: "7010", suite: "12321", asOfISO: "2026-11-15", nextYM: "2026-12", attached: true };

describe("which notice a tenant gets", () => {
  it("courtesy under 3 months, past due at 3+, credit when the credit wins, nothing under $5", () => {
    expect(tierOf(acct([ch("2026-10-01", "Base Rent", 100)]), "2026-11-15")).toBe("courtesy");
    expect(tierOf(acct([ch("2026-08-01", "Base Rent", 100)]), "2026-11-15")).toBe("past-due");
    expect(tierOf(acct([ch("2026-11-01", "Base Rent", 100)], [{ dateISO: null, description: "Open Credits", amount: 500 }]), "2026-11-15")).toBe("credit");
    expect(tierOf(acct([ch("2026-11-01", "Base Rent", 3)]), "2026-11-15")).toBeNull();
  });
  it("no courtesy reminder when everything open is this month's — the 5th's statement can't tell if they've paid since", () => {
    expect(tierOf(acct([ch("2026-11-01", "Base Rent", 3900), ch("2026-11-01", "CAM Estimate", 650)]), "2026-11-15")).toBeNull();
    expect(tierOf(acct([ch("2026-10-01", "Electric Reimbursement", 212.37), ch("2026-11-01", "Base Rent", 3900)]), "2026-11-15")).toBe("courtesy");
    expect(oldestChargeMonths(acct([ch("2026-07-31", "Year End CAM Adjustment", 1)]), "2026-11-15")).toBe(4);
  });
});

describe("the credit plan", () => {
  it("clears open charges in the master order, then the next statement, the rest carried", () => {
    const a = acct([ch("2026-11-01", "Base Rent", 2480)], [{ dateISO: "2026-04-30", description: "CAM credit", amount: 6912.5 }]);
    const p = creditPlan(a, 2480)!;
    expect(p.appliedToOpen).toBe(2480);
    expect(p.toNext).toBe(2480);
    expect(p.remaining).toBeCloseTo(1952.5, 2);
    expect(creditSchedule(-a.net, 2480, "2026-12")!.months.map((m) => m.pay)).toEqual([0, 527.5]);
  });
  it("a smaller credit settles the year-end CAM before rent, and what stays open is itemized", () => {
    const a = acct([ch("2026-08-01", "Base Rent", 5200), ch("2026-07-31", "Year End CAM Adjustment", 1842.16)], [{ dateISO: null, description: "Open Credits", amount: 400 }]);
    const p = creditPlan(a, 6125)!;
    expect(p.toOpen.map((l) => l.description)).toEqual(["Year End CAM Adjustment"]);
    expect(p.toNext).toBe(0);
    const left = openAfterCredit(a, p);
    expect(left.find((l) => l.description === "Year End CAM Adjustment")!.amount).toBeCloseTo(1442.16, 2);
    expect(left.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(a.net, 2);
  });
});

describe("the emails", () => {
  it("never tell a credit tenant they owe $0 before the credit is applied", () => {
    const x = { ...base, tier: "credit" as const, monthlyCharges: 2480, applyUrl: "https://x/credit-apply/T",
      acct: acct([ch("2026-11-01", "Base Rent", 2480)], [{ dateISO: "2026-04-30", description: "CAM credit", amount: 6912.5 }]) };
    const p = monthlyReminderParts(x);
    expect(p.opening).toContain("not applied yet");
    const { html, text } = renderMonthlyReminder(x, p.opening, p.closing);
    expect(html).toContain("Not yet applied");
    expect(html).toContain("https://x/credit-apply/T");
    expect(text).toContain("https://x/credit-apply/T");
  });
  it("carry the in-transit line, no refund offer and no phone number", () => {
    const x = { ...base, tier: "past-due" as const, monthlyCharges: 6125, acct: acct([ch("2026-08-01", "Base Rent", 5200)]) };
    const p = monthlyReminderParts(x);
    const { html } = renderMonthlyReminder(x, p.opening, p.closing);
    expect(html).toContain("Payment already on its way?");
    expect(html.toLowerCase()).not.toContain("refund");
    expect(html).not.toMatch(/\d{3}\.\d{3}\.\d{4}/);
  });
  it("the confirmation leads with the credit still on account", () => {
    const a = acct([ch("2026-11-01", "Base Rent", 2480)], [{ dateISO: "2026-04-30", description: "CAM credit", amount: 6912.5 }]);
    const plan = creditPlan(a, 2480)!;
    const e = renderCreditAppliedEmail({ ...base, plan, charges: 2480, balanceAfter: 0, stillOpen: [], requestedAtISO: "2026-11-17" });
    expect(e.html).toContain("Credit still on your account");
    expect(e.html).toContain("$1,952.50");
  });
});
