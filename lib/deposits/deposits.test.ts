import { describe, it, expect } from "vitest";
import { duplicateDepositIds, depositDupKey, normalizeCheckNumber, type SecurityDeposit } from "./deposits";

function dep(p: Partial<SecurityDeposit>): SecurityDeposit {
  return {
    id: p.id ?? "x", unitRef: p.unitRef ?? "4080-111A", propertyCode: "4080",
    tenantCompany: p.tenantCompany ?? "Acme", checkNumber: p.checkNumber ?? "",
    amount: p.amount ?? 0, checkDate: p.checkDate ?? "", account: "ni-llc",
    checkImage: null, notes: "", refunded: false, refundDate: "",
    tenantDefaulted: false, partialRefund: false, partialRefundAmount: 0, partialRefundNote: "",
    createdAt: "", updatedAt: "",
  };
}

describe("normalizeCheckNumber", () => {
  it("strips punctuation and casing so #1234 == 1234", () => {
    expect(normalizeCheckNumber("#1234")).toBe("1234");
    expect(normalizeCheckNumber(" 12-34 ")).toBe("1234");
    expect(normalizeCheckNumber("")).toBe("");
  });
});

describe("depositDupKey", () => {
  it("keys on check # when present", () => {
    expect(depositDupKey({ checkNumber: "#1001", amount: 5, checkDate: "2025-01-01" })).toBe("c:1001");
  });
  it("falls back to amount + date when no check #", () => {
    expect(depositDupKey({ checkNumber: "", amount: 1500, checkDate: "2025-02-03" })).toBe("a:150000|2025-02-03");
  });
  it("returns null when there's nothing to compare", () => {
    expect(depositDupKey({ checkNumber: "", amount: 0, checkDate: "" })).toBeNull();
  });
});

describe("duplicateDepositIds", () => {
  it("flags two checks with the same # for the same unit", () => {
    const dups = duplicateDepositIds([
      dep({ id: "a", unitRef: "4080-111A", checkNumber: "1001", amount: 1000 }),
      dep({ id: "b", unitRef: "4080-111A", checkNumber: "#1001", amount: 1000 }),
    ]);
    expect(dups).toEqual(new Set(["a", "b"]));
  });

  it("does NOT flag distinct check numbers (a real multi-check deposit)", () => {
    const dups = duplicateDepositIds([
      dep({ id: "a", unitRef: "4080-111A", checkNumber: "1001", amount: 1000 }),
      dep({ id: "b", unitRef: "4080-111A", checkNumber: "1002", amount: 1000 }),
    ]);
    expect(dups.size).toBe(0);
  });

  it("flags same amount + date when both checks have no check #", () => {
    const dups = duplicateDepositIds([
      dep({ id: "a", checkNumber: "", amount: 2000, checkDate: "2025-03-01" }),
      dep({ id: "b", checkNumber: "", amount: 2000, checkDate: "2025-03-01" }),
    ]);
    expect(dups).toEqual(new Set(["a", "b"]));
  });

  it("does not group different units that share a check #", () => {
    const dups = duplicateDepositIds([
      dep({ id: "a", unitRef: "4080-111A", checkNumber: "1001", amount: 1000 }),
      dep({ id: "b", unitRef: "4080-222B", checkNumber: "1001", amount: 1000 }),
    ]);
    expect(dups.size).toBe(0);
  });

  it("ignores records with nothing to compare (no check #, no amount)", () => {
    const dups = duplicateDepositIds([
      dep({ id: "a", checkNumber: "", amount: 0 }),
      dep({ id: "b", checkNumber: "", amount: 0 }),
    ]);
    expect(dups.size).toBe(0);
  });
});

describe("The Office Works section", () => {
  it("files a 4900 tenant's deposit in its own section, even one saved before it existed", async () => {
    const { accountForProperty, depositAccountOf, sanitizeDeposit } = await import("./deposits");
    expect(accountForProperty("4900")).toBe("office-works");
    expect(accountForProperty("4050")).toBe("ni-llc");
    expect(accountForProperty("9510")).toBe("all-but-ni");
    expect(sanitizeDeposit({ propertyCode: "4900", unitRef: "4900-12" }).account).toBe("office-works");
    expect(depositAccountOf({ propertyCode: "4900" })).toBe("office-works");
  });
});

describe("partial refunds", () => {
  it("held = the check less every partial refund", async () => {
    const { heldAmount, sanitizeDeposit } = await import("./deposits");
    const d = sanitizeDeposit({
      propertyCode: "4070", unitRef: "4070-209", amount: "12,615.45",
      refunds: [
        { date: "2026-03-01", amount: "1,000", note: "second" },
        { date: "2025-06-30", amount: 4405.45, note: "Partial Return of SD per 5th Amendment 2025" },
      ],
    });
    expect(d.amount).toBe(12615.45);
    expect(d.refunds!.map((r) => r.date)).toEqual(["2025-06-30", "2026-03-01"]);
    expect(d.partialRefund).toBe(true);
    expect(d.partialRefundAmount).toBe(5405.45);
    expect(heldAmount(d)).toBe(7210);
  });
  it("reads a record saved before the timeline as one undated refund", async () => {
    const { heldAmount, refundsOf } = await import("./deposits");
    const old = dep({ amount: 12615.45 });
    old.partialRefund = true; old.partialRefundAmount = 4405.45;
    expect(refundsOf(old)).toHaveLength(1);
    expect(heldAmount(old)).toBe(8210);
  });
  it("holds nothing once refunded or forfeited, never below zero", async () => {
    const { heldAmount } = await import("./deposits");
    expect(heldAmount({ ...dep({ amount: 500 }), refunded: true })).toBe(0);
    expect(heldAmount({ ...dep({ amount: 500 }), tenantDefaulted: true })).toBe(0);
    expect(heldAmount({ ...dep({ amount: 500 }), refunds: [{ id: "a", date: "", amount: 900, note: "" }] })).toBe(0);
  });
});
