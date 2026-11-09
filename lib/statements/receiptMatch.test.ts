import { describe, expect, it } from "vitest";
import { accountOf, applicationClassOf, byHierarchy, composeReceiptEmail, explainPayment, planById, respondByFrom } from "./receiptMatch";
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
    // The payment covers October; their $300 credit goes on September's
    // charges (master order: CAM first) to bring them current.
    expect(e.lines.filter((l) => l.fromPayment).every((l) => l.dateISO === "2026-10-01")).toBe(true);
    expect(e.lines.filter((l) => l.fromCredit).map((l) => [l.appClass, l.dateISO, l.fromCredit])).toEqual([["cam", "2026-09-01", 300]]);
    expect(e.creditUsed).toBe(300);
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
    const paid = e?.lines.filter((l) => l.fromPayment) ?? [];
    expect(paid).toHaveLength(1);
    expect(paid[0].description).toBe("CAM Estimate");
  });

  it("a payment nothing explains → the master order: every CAM, then every RET, rent last", () => {
    const all = explainPayment(acct, 2100);
    const fb = all.find((x) => x.fallback)!;
    expect(fb.title).toBe("Apply in the standard order");
    expect(fb.lines.map((l) => [l.appClass, l.dateISO, l.fromPayment])).toEqual([
      ["cam", "2026-09-01", 450], ["cam", "2026-10-01", 450],
      ["ret", "2026-09-01", 200], ["ret", "2026-10-01", 200],
      ["rent", "2026-09-01", 800],
    ]);
    expect(fb.balanceAfter).toBe(2900);
  });

  it("a payment short of the charges ALWAYS uses the credit — every plan, to bring them current", () => {
    for (const paid of [2100, 2650, 4000, 450, 4975]) {
      for (const e of explainPayment(acct, paid)) expect(e.creditUsed).toBe(300);
    }
    // Only when nothing is left open does the credit stay on account.
    expect(top(5300).creditUsed).toBe(0);
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
    // RET before rent in the master order: $200 to the RET, $450 to the rent.
    expect(custom.lines.filter((l) => l.fromPayment).map((l) => [l.idx, l.fromPayment])).toEqual([[2, 200], [0, 450]]);
    expect(custom.creditUsed).toBe(300);
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
    expect(body).toMatch(/reply to this email by Wednesday, November 11, 2026/);
    expect(body).toMatch(/If you are not the person who makes payment allocation decisions for your company, please forward this email/);
    expect(body).toMatch(/If we don't hear from you by then, we'll apply it as shown above/);
  });

  it("gives the tenant two business days — a Friday email until Tuesday", () => {
    expect(respondByFrom("2026-11-09")).toBe("2026-11-11");
    expect(respondByFrom("2026-11-13")).toBe("2026-11-17");
  });
});

describe("the master order of application", () => {
  const cls = (description: string, category: StatementCharge["category"]) => applicationClassOf({ description, category });
  it("recognises each charge by its statement wording", () => {
    expect(cls("U & O", "uando")).toBe("uando");
    expect(cls("Legal Fees - Collection", "other")).toBe("legal");
    expect(cls("AD - Attorney Fees", "other")).toBe("legal");
    expect(cls("Elec  05/12/2026 - 06/11/2026", "utilities")).toBe("electric");
    expect(cls("WATER & SEWER", "utilities")).toBe("water");
    expect(cls("2025 Year End CAM Adjustment", "cam")).toBe("yec");
    expect(cls("2024 RET Reconciliation", "ret")).toBe("rer");
    expect(cls("2025 Year End INS Adjustment", "insurance")).toBe("yei");
    expect(cls("2026 CAM Estimate", "cam")).toBe("cam");
    expect(cls("2026 RET Estimate", "ret")).toBe("ret");
    expect(cls("2026 INS Estimate", "insurance")).toBe("ins");
    expect(cls("Monthly Rent", "rent")).toBe("rent");
    expect(cls("PGW - 6.12.2026 - 7.15.2026", "utilities")).toBe("other");
    expect(cls("Late Fee", "other")).toBe("other");
  });

  it("orders by charge type, oldest first within each — every electric before any rent", () => {
    const a = accountOf(st([
      ch("2026-09-01", "Monthly Rent", "rent", 1000),
      ch("2026-10-01", "2026 CAM Estimate", "cam", 300),
      ch("2026-10-15", "Elec 09/01/2026 - 09/30/2026", "utilities", 120),
      ch("2026-04-22", "2025 Year End CAM Adjustment", "cam", 900),
      ch("2026-08-15", "Elec 07/01/2026 - 07/31/2026", "utilities", 110),
      ch("2026-10-01", "U & O", "uando", 50),
      ch("2026-07-01", "Legal Fees", "other", 400),
    ]));
    expect(byHierarchy(a.charges).map((x) => x.description)).toEqual([
      "U & O", "Legal Fees", "Elec 07/01/2026 - 07/31/2026", "Elec 09/01/2026 - 09/30/2026",
      "2025 Year End CAM Adjustment", "2026 CAM Estimate", "Monthly Rent",
    ]);
  });

  it("the email states the order when we chose it", () => {
    const fb = explainPayment(acct, 2100).find((x) => x.fallback)!;
    const { body } = composeReceiptEmail({
      tenantName: "T", propertyName: "P", suite: "1", amount: 2100, receivedISO: "2026-11-09", asOfISO: null, acct, plan: fb,
      respondByISO: "2026-11-10", signer: { name: "AR", email: "ar@x.com" },
    });
    expect(body).toMatch(/applied in our standard order: Use & Occupancy, legal charges, electric, water/);
    expect(body).toMatch(/rent last — the oldest charge first within each/);
  });
});
