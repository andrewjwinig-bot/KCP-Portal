import { describe, expect, it } from "vitest";
import { accountOf, composeReceiptEmail, explainPayment, planById, respondByFrom } from "./receiptMatch";
import type { StatementCharge, TenantStatement } from "./types";

const ch = (dateISO: string | null, description: string, category: StatementCharge["category"], amount: number): StatementCharge => ({ dateISO, description, category, amount });
const st = (charges: StatementCharge[]): TenantStatement => ({
  unitRef: "2300-1817", skylineUnitRef: "2300-1817-CU", propertyCode: "2300", suite: "1817", tenantName: "Test Tenant", address: [],
  charges, reportedBalance: charges.reduce((a, x) => a + x.amount, 0), chargeTotal: charges.reduce((a, x) => a + x.amount, 0), tiesOut: true,
});

// Two months of rent + CAM + RET and a $300 credit: gross $5,300, net $5,000.
const tenant = st([
  ch("2026-09-01", "Base Rent", "rent", 2000),
  ch("2026-09-01", "CAM Estimate", "cam", 450),
  ch("2026-09-01", "Real Estate Tax Estimate", "ret", 200),
  ch("2026-10-01", "Base Rent", "rent", 2000),
  ch("2026-10-01", "CAM Estimate", "cam", 450),
  ch("2026-10-01", "Real Estate Tax Estimate", "ret", 200),
  ch(null, "Open Credits", "credit", -300),
]);
const acct = accountOf(tenant);
const top = (paid: number) => explainPayment(acct, paid, { currentMonth: "2026-10" })[0];

describe("reading the tenant's mind", () => {
  it("reads the account: gross, credit, net", () => {
    expect([acct.gross, acct.credit, acct.net]).toEqual([5300, 300, 5000]);
  });

  it("paid the net balance → they took the credit", () => {
    const e = top(5000);
    expect(e.id).toBe("full-net");
    expect(e.creditUsed).toBe(300);
    expect(e.balanceAfter).toBe(0);
  });

  it("paid every charge → they forgot the credit, which stays on account", () => {
    const e = top(5300);
    expect(e.id).toBe("full-gross");
    expect(e.creditUsed).toBe(0);
    expect(e.balanceAfter).toBe(-300);
  });

  it("paid one month's bill → that month, current month preferred", () => {
    const e = top(2650);
    expect(e.title).toBe("Paid the October 2026 charges");
    expect(e.lines.every((l) => l.dateISO === "2026-10-01")).toBe(true);
    expect(e.balanceAfter).toBe(2350);
    // September is offered too.
    expect(explainPayment(acct, 2650).some((x) => x.title === "Paid the September 2026 charges")).toBe(true);
  });

  it("paid a month less the credit", () => {
    expect(explainPayment(acct, 2350).some((e) => e.id.startsWith("months-net:") && e.creditUsed === 300)).toBe(true);
  });

  it("paid all the rent", () => {
    expect(top(4000).id).toBe("cat:rent");
  });

  it("paid everything except one charge they question", () => {
    const e = explainPayment(acct, 5100).find((x) => x.id.startsWith("skip:"));
    expect(e?.title).toMatch(/except Real Estate Tax Estimate/);
  });

  it("paid one specific old item", () => {
    const e = explainPayment(acct, 450).find((x) => x.id.startsWith("items:"));
    expect(e?.lines).toHaveLength(1);
    expect(e?.lines[0].description).toBe("CAM Estimate");
  });

  it("a payment nothing explains → the hierarchy, oldest month first, rent first", () => {
    const all = explainPayment(acct, 2100);
    const fb = all.find((x) => x.fallback)!;
    expect(fb).toBeTruthy();
    expect(fb.lines[0]).toMatchObject({ dateISO: "2026-09-01", category: "rent", fromPayment: 2000 });
    expect(fb.lines[1]).toMatchObject({ category: "cam", fromPayment: 100 });
    expect(fb.balanceAfter).toBe(2900);
  });

  it("a short payment close to the balance is named as one", () => {
    expect(top(4975).title).toBe("Short-paid the statement balance by $25.00");
  });

  it("an overpayment is held as a credit", () => {
    const fb = explainPayment(acct, 6000).find((x) => x.fallback)!;
    expect(fb.unapplied).toBe(700);
    expect(fb.balanceAfter).toBe(-1000);
  });

  it("re-derives a plan by id, and a hand-picked one", () => {
    expect(planById(acct, 5000, "full-net")?.creditUsed).toBe(300);
    const custom = planById(acct, 650, "custom:0,2")!;
    // Rent before RET in the hierarchy: the $650 lands on September's rent.
    expect(custom.lines).toHaveLength(1);
    expect(custom.lines[0]).toMatchObject({ idx: 0, fromPayment: 650 });
  });
});

describe("the email", () => {
  it("states the account, the plan, the deadline and the default", () => {
    const plan = top(5300);
    const { subject, body } = composeReceiptEmail({
      tenantName: "Test Tenant", propertyName: "Brookwood Shopping Center", suite: "1817", amount: 5300, receivedISO: "2026-11-09", checkNo: "1042",
      asOfISO: "2026-11-01", acct, plan, respondByISO: respondByFrom("2026-11-09"), signer: { name: "Tami", email: "ar@kormancommercial.com" },
    });
    expect(subject).toBe("Your payment of $5,300.00 — Brookwood Shopping Center, Suite 1817");
    expect(body).toMatch(/check #1042/);
    expect(body).toMatch(/Less: credit on your account/);
    expect(body).toMatch(/your account will carry a credit of \$300\.00/);
    expect(body).toMatch(/reply to this email by Tuesday, November 10, 2026/);
    expect(body).toMatch(/If we don't hear from you by then, we'll apply it as shown above/);
  });

  it("gives a Friday payment until Monday", () => {
    expect(respondByFrom("2026-11-13")).toBe("2026-11-16");
  });
});
