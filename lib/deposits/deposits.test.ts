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
