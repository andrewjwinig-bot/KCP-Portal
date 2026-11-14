import { describe, it, expect } from "vitest";
import { computeStatement, type ComputeInput } from "./compute";
import { isKnownObligation } from "./flagRules";
import type { GlSummaryRow, LineBudget, StatementMapping } from "./types";

// "Not posted to the GL" answers ONE question: is a figure the statement should
// be carrying simply absent? Debt answers it with evidence (the lender's
// schedule). A budget does not — it is a plan, and an unspent plan is usually
// timing or the right outcome. These pin which lines a BUDGET alone can accuse.

const mapping: StatementMapping = {
  propertyCode: "TEST",
  entityName: "Test Center LP",
  sections: [
    {
      name: "Reimbursable Expenses",
      role: "reimbursable-expense",
      lines: [
        { label: "Electric", mask: "4710-*" },
        { label: "Real Estate Taxes", mask: "6410-*" },
        { label: "Property Insurance", mask: "6510-*" },
        { label: "Management Fee", mask: "6610-*" },
        { label: "Parking Lot Maintenance", mask: "6320-*" },
        { label: "Snow Removal", mask: "6370-*" },
      ],
    },
  ],
};

// Nothing posted anywhere — every line reads $0 for the year.
const gl: GlSummaryRow[] = [];

const budget: LineBudget = { periodBudget: 400, ytdBudget: 4_000, annualBudget: 4_800 };
const budgetLookup: ComputeInput["budgetLookup"] = () => budget;

const lines = computeStatement({
  mapping, propertyName: "Test Center", year: 2026, period: 10, gl, budgetLookup,
}).sections[0].lines;
const missing = (label: string) => lines.find((l) => l.label === label)!.expectedMissing;

describe("a budget can only accuse a KNOWN OBLIGATION", () => {
  it("flags the things that get billed whether or not anyone acts", () => {
    // The municipality bills the taxes; a bound policy is invoiced; LIK bills
    // every building its management fee. A whole year at $0 cannot be timing.
    for (const label of ["Real Estate Taxes", "Property Insurance", "Management Fee"]) {
      expect(missing(label), label).toMatchObject({ basis: "budget", scope: "ytd", expected: 4_000 });
    }
  });

  it("says nothing about a contractual line that simply has not been keyed", () => {
    // Electric IS contractual — the bill is coming — but a $0 Electric line is
    // an unkeyed invoice, not a missing posting, and it filled the card with
    // rows nobody acted on. The variance checks own this case.
    expect(missing("Electric")).toBeNull();
    expect(missing("Snow Removal")).toBeNull();
  });

  it("still says nothing about an as-needed provision", () => {
    // The pre-existing discretionary exemption, unchanged: a year that needed
    // no patching is a good year, not an unposted charge.
    expect(missing("Parking Lot Maintenance")).toBeNull();
  });
});

describe("isKnownObligation", () => {
  it("reads the SECTION when the label alone does not say", () => {
    // "Interest" under Debt Service is an obligation; "Interest" on its own
    // could be anything.
    expect(isKnownObligation({ label: "Interest" })).toBe(false);
    expect(isKnownObligation({ label: "Interest", section: "Debt Service" })).toBe(true);
  });

  it("covers the ways this chart of accounts spells taxes and insurance", () => {
    for (const label of ["R.E. Tax", "Property Taxes", "Liability Insurance", "Mgmt Fee", "Mortgage Principal"]) {
      expect(isKnownObligation({ label }), label).toBe(true);
    }
  });
});
