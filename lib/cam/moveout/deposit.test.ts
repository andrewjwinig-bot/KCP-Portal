import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/deposits/storage", () => ({ listDeposits: async () => [] }));
import { pickDeposit } from "./deposit";

const d = (unitRef: string, tenantCompany: string, extra: any = {}) => ({ unitRef, tenantCompany, amount: 1000, ...extra } as any);

describe("the departing tenant's deposit", () => {
  it("a re-leased suite: picks the departed tenant's, not the new tenant's", () => {
    const all = [d("3640-200", "Search Engines Marketer, Inc.", { amount: 5000 }), d("3640-200", "New Tenant LLC", { amount: 9000 })];
    expect(pickDeposit(all, "3640-200", "Search Engines Marketer, Inc.")!.amount).toBe(5000);
  });
  it("falls back to their name elsewhere, then to the suite", () => {
    expect(pickDeposit([d("OTHER", "Acme Widgets Inc")], "1100-5", "Acme Widgets")!.unitRef).toBe("OTHER");
    expect(pickDeposit([d("1100-5", "Filed Oddly")], "1100-5", "Acme Widgets")!.tenantCompany).toBe("Filed Oddly");
  });
});
