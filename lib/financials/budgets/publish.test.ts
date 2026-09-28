import { describe, it, expect } from "vitest";
import { draftToPropertyBudget, buildPublishedWorkbook, draftFingerprint, publishedWorkbookId } from "./publish";
import { pickBudgetYear, preferredWorkbooks } from "./inForce";
import { consolidateDrafts } from "./consolidate";
import { makeBudgetLookup } from "@/lib/financials/operating-statements/budgetCrosswalk";

const m = (v: number) => new Array(12).fill(v);
const L = (label: string, mask: string, months: number[], extra: any = {}) => ({ label, mask, months, total: months.reduce((a, b) => a + b, 0), basisTotal: 0, source: "reproj-growth", ...extra });
const sec = (name: string, role: string, lines: any[]) => {
  const subtotal = m(0).map((_, i) => lines.reduce((a, l) => a + l.months[i], 0));
  return { name, role, lines, subtotal, total: subtotal.reduce((a, b) => a + b, 0) };
};
const draft = (code: string, rent = 1000): any => {
  const sections = [
    sec("Revenues", "revenue", [L("Rental Income", "4230-*", m(rent), { glAccounts: ["4230-8501"] })]),
    sec("Reimbursable Expenses", "reimbursable-expense", [
      // Two accounts, published as themselves.
      L("Building Maintenance", "6220-8502,6220-8503", m(300), { subLines: [
        { account: "6220-8502", name: "Bldg Maint", months: m(200), total: 2400, basisTotal: 0, typeable: true },
        { account: "6220-8503", name: "Bldg Maint Office", months: m(100), total: 1200, basisTotal: 0, typeable: true },
      ] }),
      // Bucketed: one account, descriptive buckets beneath.
      L("Insurance", "6510-*", m(100), { glAccounts: ["6510-8502"], subLines: [
        { account: "Liability", label: "Liability", bucket: "seeded", months: m(60), total: 720, basisTotal: 0, typeable: false },
        { account: "Property", label: "Property", bucket: "seeded", months: m(40), total: 480, basisTotal: 0, typeable: false },
      ] }),
      // Nothing on the GL and a wildcard mask: falls to last year's budget.
      L("Snow Removal", "6370-*", m(50)),
      // Nowhere to go at all.
      L("Mystery", "6999-*", m(10)),
    ]),
    sec("Capital", "capital", [L("Tenant Improvements", "1440-0000", m(20))]),
    sec("Debt Service", "debt-service", [L("Interest", "9210-8501", m(30), { glAccounts: ["9210-8501"] })]),
  ];
  const rev = m(rent), opex = m(460);
  return {
    propertyCode: code, propertyName: `Property ${code}`, budgetYear: 2027, basisYear: 2026, growthPct: 3, sections,
    rollups: { totalRevenues: { months: rev, total: rent * 12 }, totalOperatingExpenses: { months: opex, total: 460 * 12 }, netOperatingIncome: { months: rev.map((v, i) => v - opex[i]), total: (rent - 460) * 12 } },
    tenantRevenue: [{ unitRef: `${code}-1`, tenant: "A", sqft: 1000, status: "occupied", rent: m(rent), cam: m(0), ins: m(0), ret: m(0), assumed: m(0).map(() => false) },
      { unitRef: `${code}-2`, tenant: "Vacant", sqft: 1000, status: "vacant", rent: [0, 0, 0, 0, 0, 0, 500, 500, 500, 500, 500, 500], cam: m(0), ins: m(0), ret: m(0), assumed: m(0).map(() => false) }],
    notes: { "Reimbursable Expenses::Snow Removal": { text: "Heavy winter assumed", by: "DREW", at: "" } },
  };
};
const prior: any = { propertyCode: "9510", sections: [{ name: "Reimbursable Expenses", lines: [{ glAccount: "6370-8502", label: "Snow Removal", months: m(0), total: 0, isSubtotal: false }] }], skylineImport: [] };

describe("a draft published as the workbook shape the readers already read", () => {
  const { property, unmapped } = draftToPropertyBudget(draft("9510"), prior);
  const lines = property.sections.flatMap((s) => s.lines);
  const find = (label: string) => lines.find((l) => l.label === label)!;

  it("codes every line to its GL account", () => {
    expect(find("Rental Income").glAccount).toBe("4230-8501");
    expect(find("Insurance").glAccount).toBe("6510-8502");
    expect(find("Snow Removal").glAccount).toBe("6370-8502");     // last year's budget
    expect(find("Tenant Improvements").glAccount).toBe("1440-0000"); // exact mask
  });
  it("a line built from several accounts publishes AS them, so nothing counts twice", () => {
    const bm = find("Building Maintenance");
    expect(bm.glAccount).toBeNull();
    expect(bm.subLines!.map((s) => [s.glAccount, s.total])).toEqual([["6220-8502", 2400], ["6220-8503", 1200]]);
  });
  it("buckets stay as descriptive rows with no account", () => {
    expect(find("Insurance").subLines!.every((s) => s.glAccount === null)).toBe(true);
  });
  it("reports what it could not code instead of guessing", () => {
    expect(unmapped).toEqual([{ propertyCode: "9510", section: "Reimbursable Expenses", label: "Mystery", total: 120 }]);
    expect(find("Mystery").glAccount).toBeNull();
  });
  it("carries the line's note", () => {
    expect(find("Snow Removal").notes).toBe("Heavy winter assumed");
  });
  it("closes each section with a subtotal row", () => {
    expect(property.sections[1].lines.at(-1)).toMatchObject({ label: "Total Reimbursable Expenses", isSubtotal: true, total: 460 * 12 });
  });
  it("Skyline: revenue a credit, the rest a debit, the total = −cash flow after debt", () => {
    const sky = Object.fromEntries(property.skylineImport.map((x) => [x.glAccount, x.total]));
    expect(sky["4230-8501"]).toBe(-12000);
    expect(sky["6220-8503"]).toBe(1200);
    expect(sky["9210-8501"]).toBe(360);
    const after = property.rollups.find((r) => r.name === "CASH FLOW AFTER DEBT SERVICE")!.total;
    // The unmapped line is in cash flow but has no account to import to.
    expect(property.skylineImportTotal).toBe(-after - 120);
  });
  it("rollups: NOI, then capital, then debt", () => {
    const r = Object.fromEntries(property.rollups.map((x) => [x.name, x.total]));
    expect(r["NET OPERATING INCOME"]).toBe((1000 - 460) * 12);
    expect(r["CASH FLOW BEFORE DEBT SERVICE"]).toBe((1000 - 460 - 20) * 12);
    expect(r["CASH FLOW AFTER DEBT SERVICE"]).toBe((1000 - 460 - 20 - 30) * 12);
  });
  it("occupancy off the draft's own rent", () => {
    expect(property.rentableSqft).toBe(2000);
    expect(property.occupancyPct[0]).toBe(50);
    expect(property.occupancySqft[11]).toBe(2000);
  });
  it("the statements' Budget column finds each line by account", () => {
    const flat: any[] = [];
    const walk = (l: any) => { if (l.glAccount && !l.isSubtotal) flat.push({ glAccount: l.glAccount, label: l.label, months: l.months, total: l.total }); (l.subLines ?? []).forEach(walk); };
    lines.forEach(walk);
    const look = makeBudgetLookup({ budgetYear: 2027, fallback: false, lines: flat, tree: lines, rentAccounts: [] }, 3);
    expect(look("x", "6220-*", ["6220-*"])!.annualBudget).toBe(3600);
    expect(look("x", "6510-*", ["6510-*"])!.annualBudget).toBe(1200);
  });
});

describe("a book published as one workbook", () => {
  const drafts = [draft("7010"), draft("9510", 2000)];
  const all = consolidateDrafts("All Shopping Centers", drafts)!;
  const book: any = { id: "shopping-centers", name: "Shopping Centers", properties: ["7010", "9510"], rollsUp: true };
  const { workbook } = buildPublishedWorkbook({ book, year: 2027, drafts, consolidated: all, prior: { "9510": prior }, by: "DREW", at: "2026-10-01T00:00:00Z" });
  it("is the budget of record for its year, under its own id", () => {
    expect(workbook).toMatchObject({ id: "published-shopping-centers-2027", kind: "published", status: "final", year: 2027, category: "Shopping Centers", uploadedBy: "DREW" });
    expect(workbook.properties.map((p) => p.propertyCode)).toEqual(["7010", "9510"]);
    expect(workbook.rollup!.propertyCode).toBe("CONSOLIDATED");
    expect(publishedWorkbookId("jv3", 2027)).toBe("published-jv3-2027");
  });
  it("remembers what it published, so the page can say when the draft moves", () => {
    expect(workbook.source!.draftFingerprint).toBe(draftFingerprint(all));
    const moved = consolidateDrafts("All Shopping Centers", [draft("7010"), draft("9510", 2001)])!;
    expect(draftFingerprint(moved)).not.toBe(draftFingerprint(all));
    // Moving money between properties is a change too, not just the total.
    const swapped = consolidateDrafts("All Shopping Centers", [draft("7010", 2000), draft("9510", 1000)])!;
    expect(draftFingerprint(swapped)).not.toBe(draftFingerprint(all));
  });
});

describe("the budget in force", () => {
  it("2026 governs until January 1, 2027, even with 2027 on file", () => {
    expect(pickBudgetYear([2026, 2027], 2026)).toBe(2026);
    expect(pickBudgetYear([2026, 2027], 2027)).toBe(2027);
    expect(pickBudgetYear([2025, 2027], 2026)).toBe(2025); // the latest before, never ahead of its time
    expect(pickBudgetYear([2027], 2026)).toBe(2027);        // nothing earlier on file
    expect(pickBudgetYear([], 2026)).toBeNull();
  });
  it("one workbook per property per year: published, then final, then newest", () => {
    const w = (id: string, kind: any, status: any, uploadedAt: string) => ({ id, kind, status, uploadedAt });
    const order = preferredWorkbooks([
      w("live-draft", "live", "draft", "2026-11-01"),
      w("imported", "imported", undefined, "2026-01-01"),
      w("published", "published", "final", "2026-10-01"),
    ]).map((x) => x.id);
    expect(order).toEqual(["published", "imported", "live-draft"]);
  });
});
