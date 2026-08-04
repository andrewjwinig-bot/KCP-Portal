import { describe, it, expect } from "vitest";
import { reproject } from "./reprojections/compute";
import { buildReprojXlsx, buildReprojPdf } from "./reprojections/reprojExport";
import { computeStatement } from "./operating-statements/compute";
import { buildStatementXlsx, buildStatementPdf } from "./operating-statements/statementExport";
import type { StatementMapping, GlSummaryRow } from "./operating-statements/types";

const mapping: StatementMapping = {
  propertyCode: "TEST", entityName: "Test Center LP",
  sections: [
    { name: "Revenues", role: "revenue", lines: [{ label: "Rental income", mask: "4230-*" }] },
    { name: "Reimbursable Expenses", role: "reimbursable-expense", lines: [{ label: "Maintenance", mask: "6030-8502" }] },
    { name: "Debt Service", role: "debt-service", lines: [{ label: "Interest", mask: "9210-*" }] },
  ],
};
const m = (v: number) => new Array(12).fill(v);

const reprojection = reproject({
  mapping, propertyName: "Test Center", year: 2026,
  glMonthly: { "4230-8501": m(-100), "6030-8502": m(30), "9210-8501": m(10), "6810-8501": m(5) },
  budgetLines: [{ glAccount: "4230-8501", months: m(90) }, { glAccount: "6030-8502", months: m(25) }, { glAccount: "9210-8501", months: m(10) }],
  actualThroughMonth: 3,
});

const gl: GlSummaryRow[] = [
  { account: "4230-8501", periodActual: -100, ytdActual: -300 },
  { account: "6030-8502", periodActual: 30, ytdActual: 90 },
  { account: "9210-8501", periodActual: 10, ytdActual: 30 },
];
const statement = computeStatement({ mapping, propertyName: "Test Center", year: 2026, period: 3, gl });

const meta = { propertyCode: "TEST", propertyName: "Test Center", year: 2026, budgetYear: 2026 };
const notes = { "Revenues::Rental income": "New lease for Acme Corp not in budget — verify the abstract." };

describe("financial exports run", () => {
  it("reprojection xlsx is a valid zip", async () => {
    const buf = await buildReprojXlsx(reprojection, meta, notes);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 2).toString("latin1")).toBe("PK");
  });
  it("reprojection pdf is a valid PDF", async () => {
    const buf = await buildReprojPdf(reprojection, meta, notes);
    expect(buf.length).toBeGreaterThan(500);
    expect(Buffer.from(buf.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
  it("statement xlsx is a valid zip", async () => {
    const buf = await buildStatementXlsx(statement, { ...meta, period: 3 }, notes);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 2).toString("latin1")).toBe("PK");
  });
  it("statement pdf is a valid PDF", async () => {
    const buf = await buildStatementPdf(statement, { ...meta, period: 3 }, notes);
    expect(Buffer.from(buf.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
