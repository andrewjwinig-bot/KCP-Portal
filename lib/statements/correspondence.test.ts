import { describe, expect, it } from "vitest";
import { daysSince, lastContactByUnit, mergeCorrespondence, type TenantEmailRecord } from "./correspondence";
import { reminderEmailParts, renderReminderEmail } from "./balanceReminder";
import type { Account } from "./receiptMatch";

const log = (o: Partial<TenantEmailRecord>): TenantEmailRecord => ({
  id: "L1", kind: "balance-reminder", unitRef: "2300-1817", propertyCode: "2300", tenantName: "Test Tenant",
  sentAt: "2026-11-05T15:00:00.000Z", sentBy: "Tami", from: null, to: ["ap@t.com"], bcc: null, replyTo: null,
  subject: "Reminder", text: "Hello", html: null, messageId: null, testMode: false, attachment: null,
  summary: null, refId: null, balance: 100, ...o,
});
const receipt = { id: "R1", unitRef: "2300-1817", tenantName: "Test Tenant", sentAt: "2026-11-09T15:00:00.000Z", sentBy: "Tami", to: ["ap@t.com"], subject: "Your payment", amount: 1250, planTitle: "November rent", testMode: false };
const alloc = (o: object = {}) => ({ id: "A1", unitRef: "4500-3021", tenantName: "Grocer", amount: 500, askedAt: "2026-10-01T12:00:00.000Z", askedTo: ["x@y.com"], createdBy: "Drew", paymentRef: "Ck 12", ...o });

describe("tenant correspondence — one timeline per suite", () => {
  it("merges the log, the receipt archive and earlier allocation requests, newest first", () => {
    const all = mergeCorrespondence([log({})], [receipt], [alloc()]);
    expect(all.map((e) => e.id)).toEqual(["R1", "L1", "A1"]);
    expect(all[0].summary).toBe("$1,250.00 received · November rent");
    expect(all[2].kind).toBe("allocation-request");
    expect(all[2].viewable).toBe(false); // its wording was never kept
  });

  it("never lists a send twice when the log already carries it", () => {
    const all = mergeCorrespondence([log({ id: "L2", kind: "allocation-request", refId: "A1", unitRef: "4500-3021" })], [], [alloc()]);
    expect(all).toHaveLength(1);
    expect(all[0].source).toBe("log");
  });

  it("skips an allocation request that was recorded but never emailed", () => {
    expect(mergeCorrespondence([], [], [alloc({ askedAt: null })])).toEqual([]);
  });

  it("gives each suite its newest email and a count", () => {
    const last = lastContactByUnit(mergeCorrespondence([log({})], [receipt], [alloc()]));
    expect(last["2300-1817"].last.id).toBe("R1");
    expect(last["2300-1817"].count).toBe(2);
    expect(last["4500-3021"].count).toBe(1);
  });

  it("counts whole days since", () => {
    expect(daysSince("2026-11-09T15:00:00.000Z", new Date("2026-11-10T14:00:00.000Z"))).toBe(0);
    expect(daysSince("2026-10-01T12:00:00.000Z", new Date("2026-11-10T12:00:00.000Z"))).toBe(40);
  });
});

describe("balance reminder", () => {
  const acct: Account = {
    charges: [
      { idx: 0, dateISO: "2026-10-01", description: "Base Rent", category: "rent", appClass: "rent", amount: 2000 },
      { idx: 1, dateISO: "2026-11-01", description: "CAM <Estimate>", category: "cam", appClass: "cam", amount: 450 },
    ] as Account["charges"],
    credit: 300, creditLines: [{ dateISO: null, description: "Open Credits", amount: 300 }], gross: 2450, net: 2150,
  };
  const sig = { name: "Tami Tomlinson", title: "Accounts Receivable", email: "ttomlinson@kormancommercial.com" };

  it("says the balance, the past-due part and asks to forward", () => {
    const p = reminderEmailParts({ tenantName: "Test Tenant", propertyName: "Brookwood", suite: "1817", acct, pastDue: 2000, asOfISO: "2026-11-02", attached: true, signer: sig });
    expect(p.subject).toContain("$2,150.00 open");
    expect(p.opening).toContain("open balance of $2,150.00");
    expect(p.opening).toContain("$2,000.00 of it is past due");
    expect(p.opening).toContain("your statement is attached");
    expect(p.closing).toContain("please forward this email");
    expect(p.closing.trim().endsWith("Thank you,")).toBe(true);
  });

  it("builds the table from the account — credits in parens, total the net — and escapes", () => {
    const { html, text } = renderReminderEmail(acct, "2026-11-02", "Hi <b>", "Bye");
    expect(html).toContain("Hi &lt;b&gt;");
    expect(html).toContain("CAM &lt;Estimate&gt;");
    expect(html).toContain("($300.00)");
    expect(html).toContain("$2,150.00");
    expect(text).toContain("Balance due: $2,150.00");
  });
});
