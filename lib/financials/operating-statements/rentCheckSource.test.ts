import { describe, it, expect, vi, beforeEach } from "vitest";

// The rent check must read the rent-roll HISTORY — what the Rent Roll page
// shows — never the stored "current" pointer, which can be stale. 1100's
// August: the page read Ferry Good Treats at $2,000, the pointer still had $0,
// and the statement called the correctly billed $2,000 "UNEXPECTED".
const unit = (unitRef: string, occupantName: string, baseRent: number) => ({
  unitRef, occupantName, isVacant: false, sqft: 1000, baseRent,
  opexMonth: 0, reTaxMonth: 0, otherMonth: 0, leaseFrom: null, leaseTo: null,
});
const roll = (reportTo: string, rent: number) => ({
  reportFrom: null, reportTo,
  properties: [{ propertyCode: "1100", units: [unit("1100-12330", "Ferry Good Treats", rent)] }],
});

let history: any[] = [];
let pointer: any = null;
vi.mock("@/lib/storage", () => ({
  getJSON: vi.fn(async () => pointer),
  listJSON: vi.fn(async () => history),
}));
vi.mock("./statementStore", () => ({
  getGl: vi.fn(), getTransactions: vi.fn(),
  assembledTransactions: vi.fn(async () => ({
    "4230-0000": [{ month: 8, amount: -2000, date: "08/01/2026", description: "RNT to 1100-12330", ref: "CHG." }],
  })),
}));

import { loadRentCheckContext, runRentCheck } from "./rentCheckRun";

const check = async (period: number) => {
  const ctx = (await loadRentCheckContext("1100", 2026, null))!;
  const res = runRentCheck(ctx, { property: "1100", year: 2026, period, scope: "month", mask: "4230-*", sign: -1, basis: "base" });
  return res.rows.find((r) => r.unitRef === "1100-12330")!;
};

describe("rent check — which rent roll it reads", () => {
  beforeEach(() => { history = []; pointer = null; });

  it("reads the history, not a stale pointer", async () => {
    history = [roll("08/31/2026", 2000)];
    pointer = roll("08/31/2026", 0); // stale copy from before the parser fix
    const row = await check(8);
    expect(row.expected).toBe(2000);
    expect(row.status).toBe("ok");
  });

  it("checks a month against that month's roll, not a later import", async () => {
    history = [roll("08/31/2026", 2000), roll("09/30/2026", 2100)];
    expect((await check(8)).expected).toBe(2000);
    expect((await check(9)).expected).toBe(2100);
  });

  it("falls back to the pointer only when there is no history", async () => {
    pointer = roll("08/31/2026", 2000);
    expect((await check(8)).status).toBe("ok");
  });
});
