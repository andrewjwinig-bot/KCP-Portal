import { describe, expect, it } from "vitest";
import { buildRegister, filingEntityFor, foldVendor, registerTotals, type GlInput } from "./register";
import type { GlTransaction } from "@/lib/financials/operating-statements/glParser";

const CASH = "0110-0000";
const EXPENSE = "6200-0000";

let seq = 0;
/** A cash-account row. Negative = money out, which is what a check looks like. */
const pay = (vendor: string, amount: number, over: Partial<GlTransaction> = {}): GlTransaction => ({
  month: 3, date: "2025-03-14", vendor, description: vendor, ref: `1${++seq}`, amount: -amount, ...over,
});

const gl = (key: string, txns: Record<string, GlTransaction[]>): GlInput => ({
  key,
  transactions: txns,
  names: { [CASH]: "Cash - Operating", [EXPENSE]: "Repairs & Maintenance" },
});

describe("filingEntityFor", () => {
  it("rolls every Neshaminy Interplex building into the one EIN", () => {
    const ids = ["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"].map((k) => filingEntityFor(k));
    expect(new Set(ids.map((e) => e.id)).size).toBe(1);
    expect(ids[0]).toMatchObject({ ein: "61-1723336", name: "Neshaminy Interplex LLC" });
  });

  it("resolves a fund shell through its member buildings", () => {
    // PJV3 carries no EIN of its own; buildings 3610/3620/3640 do.
    expect(filingEntityFor("PJV3")).toEqual(filingEntityFor("3610"));
    expect(filingEntityFor("PJV3").name).toBe("Lincoln Joint Venture III");
  });

  it("keeps separate EINs apart", () => {
    expect(filingEntityFor("2300").id).not.toBe(filingEntityFor("7010").id);
  });

  it("falls back to the owning entity when there is no EIN", () => {
    // The residentials record ownerEntity but no EIN.
    expect(filingEntityFor("9800")).toMatchObject({ name: "KH 509 LLC", ein: null });
  });

  it("treats a recorded \"N/A\" as no EIN rather than an EIN named N/A", () => {
    expect(filingEntityFor("0900").ein).toBeNull();
  });

  it("does not invent an entity for an unknown GL key", () => {
    expect(filingEntityFor("ZZZZ")).toMatchObject({ id: "key:ZZZZ", ein: null });
  });
});

describe("foldVendor", () => {
  it("folds case, punctuation and spacing", () => {
    expect(foldVendor("  A.B.C.  Landscaping,  Inc. ")).toBe("a b c landscaping inc");
  });

  it("does NOT merge names that differ by a suffix", () => {
    // These may be the same vendor — but merging is a guess that silently moves
    // money onto the wrong form. Two rows the accountant can combine is safer.
    expect(foldVendor("ABC Landscaping")).not.toBe(foldVendor("ABC Landscaping LLC"));
  });
});

describe("buildRegister", () => {
  it("sums a vendor across every building sharing an EIN", () => {
    // $200 from each of four buildings is $800 from ONE filer — the case a
    // building-by-building list misses entirely.
    const gls = ["4050", "4060", "4070", "4080"].map((k) => gl(k, { [CASH]: [pay("Snow Pros", 200)] }));
    const [entity] = buildRegister(gls);
    expect(entity.ein).toBe("61-1723336");
    expect(entity.vendors).toHaveLength(1);
    expect(entity.vendors[0]).toMatchObject({ name: "Snow Pros", total: 800, count: 4 });
  });

  it("does NOT sum one vendor across different EINs", () => {
    // Each entity files its own 1099; $500 + $500 is two sub-threshold vendors,
    // not one reportable one.
    const out = buildRegister([
      gl("2300", { [CASH]: [pay("Snow Pros", 500)] }),
      gl("7010", { [CASH]: [pay("Snow Pros", 500)] }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.vendors.length === 0)).toBe(true);
    expect(out.every((e) => e.below[0].total === 500)).toBe(true);
  });

  it("reads cash accounts only — an accrued expense is not a payment", () => {
    const out = buildRegister([
      gl("2300", {
        [CASH]: [pay("Paid Vendor", 1000)],
        [EXPENSE]: [pay("Accrued Vendor", 5000)],
      }),
    ]);
    expect(out[0].vendors.map((v) => v.name)).toEqual(["Paid Vendor"]);
  });

  it("ignores money coming IN", () => {
    const out = buildRegister([
      gl("2300", { [CASH]: [pay("Tenant Deposit", -2000), pay("Roofer", 1200)] }),
    ]);
    expect(out[0].vendors.map((v) => v.name)).toEqual(["Roofer"]);
    expect(out[0].scannedTotal).toBe(1200);
  });

  it("splits at the threshold and keeps what fell below", () => {
    const out = buildRegister([
      gl("2300", { [CASH]: [pay("Over", 600), pay("Under", 599.99)] }),
    ]);
    expect(out[0].vendors.map((v) => v.name)).toEqual(["Over"]);
    expect(out[0].below.map((v) => v.name)).toEqual(["Under"]);
  });

  it("honours a custom threshold", () => {
    const out = buildRegister([gl("2300", { [CASH]: [pay("Small", 100)] })], { threshold: 50 });
    expect(out[0].vendors).toHaveLength(1);
  });

  it("drops excluded vendors from both lists but not from the scanned total", () => {
    const out = buildRegister(
      [gl("2300", { [CASH]: [pay("PECO", 5000), pay("Roofer", 900)] })],
      { excluded: new Set([foldVendor("PECO")]) },
    );
    expect(out[0].vendors.map((v) => v.name)).toEqual(["Roofer"]);
    expect(out[0].below).toHaveLength(0);
    // Still counted as money that left the account — the exclusion is about
    // reportability, not about pretending the payment didn't happen.
    expect(out[0].scannedTotal).toBe(5900);
  });

  it("counts unnamed payments instead of dropping them silently", () => {
    const out = buildRegister([
      gl("2300", { [CASH]: [pay("", 400), pay("   ", 100), pay("Roofer", 700)] }),
    ]);
    expect(out[0].unnamed).toEqual({ count: 2, total: 500 });
    expect(out[0].vendors.map((v) => v.name)).toEqual(["Roofer"]);
  });

  it("displays the spelling the ledger uses most", () => {
    const out = buildRegister([
      gl("2300", { [CASH]: [pay("ACME ROOFING", 300), pay("Acme Roofing", 300), pay("Acme Roofing", 300)] }),
    ]);
    expect(out[0].vendors[0]).toMatchObject({ name: "Acme Roofing", total: 900, count: 3 });
  });

  it("keeps each payment for the drill-down, oldest first", () => {
    const out = buildRegister([
      gl("2300", {
        [CASH]: [
          pay("Roofer", 400, { date: "2025-09-02", ref: "5002" }),
          pay("Roofer", 400, { date: "2025-01-05", ref: "5001" }),
        ],
      }),
    ]);
    const p = out[0].vendors[0].payments;
    expect(p.map((x) => x.ref)).toEqual(["5001", "5002"]);
    expect(p[0]).toMatchObject({ amount: 400, propertyName: "Brookwood Shopping Center" });
  });

  it("sorts entities by how much work they carry", () => {
    const out = buildRegister([
      gl("2300", { [CASH]: [pay("A", 900)] }),
      gl("7010", { [CASH]: [pay("A", 900), pay("B", 900)] }),
    ]);
    expect(out[0].vendors).toHaveLength(2);
  });
});

describe("registerTotals", () => {
  it("counts only the entities that actually have something to report", () => {
    const out = buildRegister([
      gl("2300", { [CASH]: [pay("Roofer", 900)] }),
      gl("7010", { [CASH]: [pay("Small", 50), pay("", 25)] }),
    ]);
    expect(registerTotals(out)).toEqual({
      entities: 1, reportable: 1, amount: 900, unnamed: 1, scanned: 975,
    });
  });
});
