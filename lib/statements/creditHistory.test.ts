import { describe, expect, it } from "vitest";
import { creditChange, creditHistory } from "./creditHistory";
import type { AgingSnapshot, OpenCreditTenant } from "./aging";
import type { StatementRun, TenantStatement } from "./types";

// Synthetic tenants only.
const st = (unitRef: string, amounts: number[], exportedAt: string): TenantStatement => ({
  unitRef, propertyCode: unitRef.split("-")[0], suite: unitRef.split("-")[1], tenantName: `Tenant ${unitRef}`,
  charges: amounts.map((amount, i) => ({ description: amount < 0 ? "Open Credits" : "Rent", dateISO: amount < 0 ? null : `${exportedAt.slice(0, 7)}-01`, amount, category: "rent" })),
  exportedAt, tiesOut: true,
} as unknown as TenantStatement);

const run = (period: string, statements: TenantStatement[]): StatementRun => ({
  period, published: false, publishedAt: null, createdAt: `${period}-05T12:00:00Z`, updatedAt: `${period}-05T12:00:00Z`, sources: [], statements,
});

const laserDate = (s: TenantStatement, upd: string) => (s.exportedAt ?? upd).slice(0, 10);

const asCurrent = (r: StatementRun): OpenCreditTenant[] => r.statements.map((s) => ({
  unitRef: s.unitRef, propertyCode: s.propertyCode, suite: s.suite, tenantName: s.tenantName, unitType: "CURR",
  contact: null, phone: null, depositsHeld: 0, balanceDue: 0, tiesOut: true, runAt: null, fromLaser: true,
  asOf: laserDate(s, r.updatedAt),
  lines: s.charges.map((c) => ({ code: "", description: c.description, dateISO: c.dateISO, amount: c.amount, bucket: 0 })),
} as unknown as OpenCreditTenant));

describe("open credits month over month", () => {
  const sep = run("2026-09", [st("1100-1", [-300], "2026-09-05"), st("1100-2", [-50], "2026-09-05"), st("1100-3", [-2], "2026-09-05")]);
  const oct = run("2026-10", [st("1100-1", [-300], "2026-10-05"), st("1100-2", [-20], "2026-10-05")]);
  const nov = run("2026-11", [st("1100-2", [-20], "2026-11-05"), st("1100-4", [-75, 100], "2026-11-05")]);

  it("reads each month as of its end and ends on the current list", () => {
    const h = creditHistory(asCurrent(nov), [], [sep, oct, nov], laserDate);
    expect(h.map((m) => m.month)).toEqual(["2026-09", "2026-10", "2026-11"]);
    // The $2 credit is under the page's $5 floor and is left off.
    expect(h[0]).toMatchObject({ tenants: 2, credit: 350 });
    expect(h[1]).toMatchObject({ tenants: 2, credit: 320 });
    expect(h[2]).toMatchObject({ tenants: 2, credit: 95, net: 5 });
  });

  it("names who cleared and who is new since last month", () => {
    const c = creditChange(creditHistory(asCurrent(nov), [], [sep, oct, nov], laserDate))!;
    expect(c.prior.month).toBe("2026-10");
    expect(c.resolved).toEqual([{ unitRef: "1100-1", credit: 300 }]);
    expect(c.added).toEqual([{ unitRef: "1100-4", credit: 75 }]);
  });

  it("a Credit Balance snapshot wins over the laser statement for the months it covers", () => {
    const snap: AgingSnapshot = {
      asOf: "2026-10-20", runAt: null, importedAt: "2026-10-20T15:00:00Z", importedBy: null, sourceFile: "x.xls", propertyCodes: ["1100"],
      tenants: [{ unitRef: "1100-1", propertyCode: "1100", suite: "1", tenantName: "Tenant 1100-1", unitType: "CURR", contact: null, phone: null, depositsHeld: 0, balanceDue: -120, tiesOut: true,
        lines: [{ code: "PPD", description: "Prepaid", dateISO: "2026-10-02", amount: -120, bucket: 0 }] }] as AgingSnapshot["tenants"],
    };
    const h = creditHistory(asCurrent(nov), [snap], [sep, oct, nov], laserDate);
    const octM = h.find((m) => m.month === "2026-10")!;
    expect(octM).toMatchObject({ tenants: 1, credit: 120, asOf: "2026-10-20" });
  });

  it("a month with no data of its own is left out, not repeated", () => {
    const h = creditHistory(asCurrent(nov), [], [sep, nov], laserDate);
    expect(h.map((m) => m.month)).toEqual(["2026-09", "2026-11"]);
    expect(creditChange([h[1]])).toBeNull();
  });
});
