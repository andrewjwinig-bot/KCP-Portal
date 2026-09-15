import { describe, it, expect } from "vitest";
import { computeBalanceSheet, balanceAt, type BsGl } from "./compute";
import { classifyAccount, isProfitAndLoss } from "./classify";

/**
 * A twelve-month ledger for a leveraged shopping-centre partnership, built as
 * real journal entries so that EVERY month balances on its own — which is what
 * lets the same fixture prove the sheet at any as-of month, not just December.
 *
 * Each month posts: rent billed (A/R ↔ income), cash collected (cash ↔ A/R),
 * an operating expense paid, depreciation, and mortgage principal. Openings
 * balance too, with partners' capital carrying the deficit these partnerships
 * actually run — distributions over the years exceed basis, so capital is a
 * DEBIT balance and equity is negative. A balance sheet that only handles
 * positive equity would be no use here.
 */
const OPENINGS: Record<string, number> = {
  "0110-0000": 400_000,      // Cash - Operating
  "0250-0000": 60_000,       // Cash - Security Deposits (restricted)
  "0410-0000": 30_000,       // Accounts Receivable - Tenants
  "1410-0000": 3_000_000,    // Building
  "1440-0000": 500_000,      // Tenant improvements
  "1510-0000": -1_700_000,   // Accumulated depreciation (credit)
  "2110-0000": -40_000,      // Accounts payable
  "2130-0000": -60_000,      // Security deposits payable
  "2720-8501": -4_300_000,   // Mortgage payable
  "3200-0000": 2_110_000,    // Partners' capital — a DEFICIT (debit balance)
};

/** Net posted to each account every month. Sums to zero: it is a journal. */
const PER_MONTH: Record<string, number> = {
  "0110-0000": 58_000,       // +74,000 collected −10,000 expense −6,000 principal
  "0410-0000": 1_000,        // 75,000 billed − 74,000 collected
  "1510-0000": -5_000,       // monthly depreciation
  "2720-8501": 6_000,        // principal paid down (debit against the liability)
  "4230-8501": -75_000,      // Rental Income - Base Rent
  "6120-0000": 10_000,       // Electric
  "6810-0000": 5_000,        // Depreciation expense
};

const NAMES: Record<string, string> = {
  "0110-0000": "Cash-Operating",
  "0250-0000": "Cash - Security Deposits",
  "0410-0000": "Accounts Receivable - Tenants",
  "1410-0000": "Building",
  "1440-0000": "Tenant Improvements",
  "1510-0000": "Accumulated Depreciation - Building",
  "2110-0000": "Accounts Payable",
  "2130-0000": "Security Deposits Payable",
  "2720-8501": "Mortgage Payable",
  "3200-0000": "Partners Capital",
  "4230-8501": "Rental Income - Base Rent",
  "6120-0000": "Electric",
  "6810-0000": "Depreciation Expense",
};

function gl(over: Partial<BsGl> = {}): BsGl {
  const monthly: Record<string, number[]> = {};
  for (const code of new Set([...Object.keys(OPENINGS), ...Object.keys(PER_MONTH)])) {
    monthly[code] = new Array(12).fill(PER_MONTH[code] ?? 0);
  }
  return { beginning: { ...OPENINGS }, monthly, names: { ...NAMES }, maxPeriodInFile: 12, coverageEnd: 12, coverageStartMonth: 1, ...over };
}

const bs = (over: Partial<BsGl> = {}, month = 12, overrides?: Record<string, string>) =>
  computeBalanceSheet(gl(over), { key: "2300", year: 2025, asOfMonth: month, overrides });

const groupTotal = (rows: { key: string; total: number }[], key: string) =>
  rows.find((g) => g.key === key)?.total ?? 0;

/** The ledger with a $25,000 debit to an account no rule recognises, posted
 *  against partners' capital so the LEDGER still balances even though the
 *  SHEET cannot place it. */
function withSuspense(): BsGl {
  const g = gl();
  g.beginning!["0999-1234"] = 25_000;
  g.beginning!["3200-0000"] = OPENINGS["3200-0000"] - 25_000;
  g.monthly["0999-1234"] = new Array(12).fill(0);
  g.names!["0999-1234"] = "Suspense";
  return g;
}

describe("the fixture is a real double-entry ledger", () => {
  it("openings balance and every month's journal nets to zero", () => {
    // If this fails the fixture is wrong, not the code — and every assertion
    // below would be meaningless.
    expect(Object.values(OPENINGS).reduce((a, b) => a + b, 0)).toBe(0);
    expect(Object.values(PER_MONTH).reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("balance sheet — the sheet balances", () => {
  it("assets equal liabilities plus partners' capital, exactly", () => {
    const s = bs();
    expect(s.totalAssets).toBe(2_938_000);
    expect(s.totalLiabilitiesAndEquity).toBe(2_938_000);
    expect(s.proof.difference).toBe(0);
    expect(s.proof.balances).toBe(true);
    expect(s.usable).toBe(true);
    expect(s.warnings).toEqual([]);
  });

  it("balances at EVERY month of the year, not just December", () => {
    // The balance is the opening plus the nets through that month, so a
    // June balance sheet is as valid as a December one — which is what an
    // interim lender request or a mid-year refinance needs.
    for (let m = 1; m <= 12; m++) {
      const s = bs({}, m);
      expect(s.proof.difference, `month ${m}`).toBe(0);
    }
  });

  it("June is genuinely mid-year, not December's figures relabelled", () => {
    const s = bs({}, 6);
    expect(s.totalAssets).toBe(2_614_000);
    expect(groupTotal(s.assets, "cash")).toBe(748_000);        // 400,000 + 6 × 58,000
    expect(groupTotal(s.liabilities, "mortgage")).toBe(4_264_000); // 4,300,000 − 6 × 6,000
    expect(s.netIncome).toBe(360_000);                          // half a year's
  });
});

describe("balance sheet — the sections", () => {
  it("puts each account on the correct side", () => {
    const s = bs();
    expect(groupTotal(s.assets, "cash")).toBe(1_096_000);
    expect(groupTotal(s.assets, "receivables")).toBe(42_000);
    expect(groupTotal(s.assets, "realEstate")).toBe(3_500_000);
    expect(groupTotal(s.liabilities, "payables")).toBe(40_000);
    expect(groupTotal(s.liabilities, "mortgage")).toBe(4_228_000);
    expect(s.totalLiabilities).toBe(4_328_000);
  });

  it("shows accumulated depreciation as a deduction INSIDE assets", () => {
    // It carries a credit balance but is not a liability: netting it against
    // cost is what makes the real estate line book value.
    const s = bs();
    const dep = s.assets.find((g) => g.key === "accumDep")!;
    expect(dep.contra).toBe(true);
    expect(dep.total).toBe(-1_760_000);
    expect(groupTotal(s.assets, "realEstate") + dep.total).toBe(1_740_000); // net book value
  });

  it("keeps security-deposit CASH and the deposit LIABILITY on opposite sides", () => {
    // Both are called "security deposits" and both are $60,000. The tenants'
    // money is an asset we hold and a liability we owe back — reading the
    // account NAME rather than the number would collapse them onto one side.
    const s = bs();
    expect(groupTotal(s.assets, "restricted")).toBe(60_000);
    expect(groupTotal(s.liabilities, "sdPayable")).toBe(60_000);
    expect(classifyAccount("0250-0000", NAMES["0250-0000"])!.section).toBe("asset");
    expect(classifyAccount("2130-0000", NAMES["2130-0000"])!.section).toBe("liability");
  });

  it("reports a capital DEFICIT rather than forcing equity positive", () => {
    const s = bs();
    expect(groupTotal(s.equity, "capital")).toBe(-2_110_000);
    expect(s.totalEquity).toBe(-1_390_000);
    expect(s.totalEquity).toBeLessThan(0);
  });
});

describe("net income is derived, never a plug", () => {
  it("is the P&L accounts' own net, income positive", () => {
    const s = bs();
    // 12 × (75,000 rent − 10,000 electric − 5,000 depreciation)
    expect(s.netIncome).toBe(720_000);
  });

  it("is what makes the sheet balance — drop it and it does not", () => {
    const s = bs();
    expect(s.totalAssets - (s.totalLiabilities + groupTotal(s.equity, "capital"))).toBe(s.netIncome);
  });

  it("keeps P&L accounts off the balance sheet itself", () => {
    const s = bs();
    const codes = [...s.assets, ...s.liabilities, ...s.equity].flatMap((g) => g.accounts.map((a) => a.code));
    expect(codes.some(isProfitAndLoss)).toBe(false);
    expect(codes).not.toContain("4230-8501");
  });
});

describe("balance sheet — it refuses to be confidently wrong", () => {
  it("will not derive balances from a GL with no opening balances", () => {
    // Without the Beginning Balance column every figure would be the year's
    // ACTIVITY, which for cash is the cash flow and for the mortgage is the
    // principal paid — numbers that look plausible and are not balances.
    const s = bs({ beginning: {} });
    expect(s.usable).toBe(false);
    expect(s.warnings.join(" ")).toMatch(/no Beginning Balances/i);
  });

  it("surfaces an unrecognised account instead of dropping it, and it IS the gap", () => {
    // Posted as a real entry — a $25,000 debit to a suspense account against
    // capital — so the ledger still balances and the ONLY reason the sheet
    // does not is that the account was excluded from it.
    const s = computeBalanceSheet(withSuspense(), { key: "2300", year: 2025, asOfMonth: 12 });
    expect(s.unclassified.map((a) => a.code)).toEqual(["0999-1234"]);
    expect(s.proof.difference).toBe(-25_000);
    expect(s.usable).toBe(false);
    expect(s.warnings.join(" ")).toMatch(/could not be placed/i);
  });

  it("the gap is always exactly what was left off the sheet", () => {
    // The invariant behind the proof: on a balanced ledger every signed
    // balance sums to zero, so whatever the sheet fails to place is precisely
    // what it is out by. That is why the difference is worth showing — it
    // names the problem instead of just reporting one.
    const s = computeBalanceSheet(withSuspense(), { key: "2300", year: 2025, asOfMonth: 12 });
    const leftOff = s.unclassified.reduce((t, a) => t + a.signed, 0);
    expect(s.proof.difference).toBe(-leftOff);
  });

  it("an override rescues an unrecognised account and the sheet balances again", () => {
    const s = computeBalanceSheet(withSuspense(), {
      key: "2300", year: 2025, asOfMonth: 12,
      overrides: { "0999-1234": "prepaid" },
    });
    expect(s.unclassified).toEqual([]);
    expect(groupTotal(s.assets, "prepaid")).toBe(25_000);
    expect(s.proof.difference).toBe(0);
    expect(s.usable).toBe(true);
  });

  it("says so when the GL does not reach the month asked for", () => {
    const s = bs({ coverageEnd: 9, maxPeriodInFile: 9 }, 12);
    expect(s.usable).toBe(false);
    expect(s.warnings.join(" ")).toMatch(/covers through month 9/i);
  });

  it("says so when a partial-year GL has no opening for the early months", () => {
    const s = bs({ coverageStartMonth: 3 }, 12);
    expect(s.usable).toBe(false);
    expect(s.warnings.join(" ")).toMatch(/opens at month 3/i);
  });

  it("reports the exact dollar gap when it does not balance", () => {
    const g = gl();
    g.beginning!["3200-0000"] = 2_110_000 - 1_234.56; // capital keyed short
    const s = computeBalanceSheet(g, { key: "2300", year: 2025, asOfMonth: 12 });
    expect(s.proof.balances).toBe(false);
    expect(s.proof.difference).toBe(-1_234.56);
    expect(s.warnings.join(" ")).toMatch(/out of balance by/i);
  });
});

describe("balanceAt", () => {
  it("is the opening plus every net through the month", () => {
    const g = gl();
    expect(balanceAt(g, "0110-0000", 1)).toBe(458_000);
    expect(balanceAt(g, "0110-0000", 12)).toBe(1_096_000);
  });

  it("treats an account with no opening as starting at zero", () => {
    const g = gl();
    expect(balanceAt(g, "4230-8501", 12)).toBe(-900_000);
  });
});

describe("classifier", () => {
  it("splits the balance sheet from the P&L at 4000", () => {
    expect(isProfitAndLoss("3700-0000")).toBe(false);
    expect(isProfitAndLoss("4230-8501")).toBe(true);
    expect(isProfitAndLoss("9210-0000")).toBe(true); // mortgage INTEREST is expense…
    expect(classifyAccount("2720-8501")!.key).toBe("mortgage"); // …the PRINCIPAL is the liability
  });

  it("reads 1940 by its sub-account — same major, opposite sides", () => {
    expect(classifyAccount("1940-0000")!.key).toBe("accumDep");  // accumulated amortization
    expect(classifyAccount("1940-8501")!.key).toBe("deferred");  // capitalized lease costs
  });

  it("falls back to the account name only for accounts no range covers", () => {
    expect(classifyAccount("0850-0000", "Prepaid Insurance")!.key).toBe("prepaid");
    // …but the range wins where there is one, so a name cannot move an account
    // off the side its number puts it on.
    expect(classifyAccount("0250-0000", "Security Deposits Payable")!.section).toBe("asset");
  });

  it("returns nothing for an account it does not recognise", () => {
    expect(classifyAccount("0999-1234", "Suspense")).toBeNull();
    expect(classifyAccount("not-an-account")).toBeNull();
  });
});

describe("what the balance proof does NOT prove", () => {
  it("still balances when an account is on the WRONG SIDE — by construction", () => {
    // This is the honest limit of the check, and it is worth a test so nobody
    // reads the green pill as more than it is. Assets are the GL's signed
    // balances and liabilities/capital are those balances negated, so the
    // difference works out to the sum of EVERY signed balance — which a
    // double-entry ledger makes zero no matter which section each account was
    // filed under. Move the mortgage into prepaid expenses and the sheet still
    // reports "in balance"; total assets and total liabilities are simply both
    // wrong by the same amount.
    const wrong = bs({}, 12, { "2720-8501": "prepaid" });
    expect(wrong.proof.difference).toBe(0);
    expect(wrong.proof.balances).toBe(true);

    const right = bs();
    expect(wrong.totalAssets).not.toBe(right.totalAssets);
    expect(groupTotal(wrong.liabilities, "mortgage")).toBe(0);

    // The proof catches OMISSION. Placement is caught by the ledger tie-out and
    // by reading the account names — not by this.
  });
});

describe("tie-out to the ledger's own printed ending balances", () => {
  const withReported = (over: Record<string, number> = {}): BsGl => {
    const g = gl();
    const ytdTotal: Record<string, number> = {};
    for (const code of Object.keys(g.monthly)) ytdTotal[code] = balanceAt(g, code, 12);
    return { ...g, ytdTotal: { ...ytdTotal, ...over } };
  };

  it("agrees when the opening plus the nets lands on the printed total", () => {
    // The two are derived differently — one is addition here, the other is a
    // figure Skyline printed — so agreement checks this code's arithmetic
    // against an outside source rather than against itself.
    const s = computeBalanceSheet(withReported(), { key: "2300", year: 2025, asOfMonth: 12 });
    expect(s.tieOut?.mismatches).toEqual([]);
    expect(s.tieOut!.checked).toBeGreaterThan(5);
    expect(s.usable).toBe(true);
  });

  it("names the account, both figures and the gap when one does not tie", () => {
    const s = computeBalanceSheet(withReported({ "0110-0000": 1_095_000 }), { key: "2300", year: 2025, asOfMonth: 12 });
    expect(s.tieOut!.mismatches).toEqual([
      { code: "0110-0000", name: "Cash-Operating", computed: 1_096_000, reported: 1_095_000, diff: 1_000 },
    ]);
    expect(s.usable).toBe(false);
    expect(s.warnings.join(" ")).toMatch(/not match the ending balance/i);
  });

  it("does not check a mid-year sheet against the year-end column", () => {
    // A June balance is not meant to equal the ledger's December total, so
    // comparing them would report a mismatch that is simply correct.
    const s = computeBalanceSheet(withReported(), { key: "2300", year: 2025, asOfMonth: 6 });
    expect(s.tieOut).toBeNull();
    expect(s.usable).toBe(true);
  });

  it("is null, not a false pass, on an upload with no printed totals", () => {
    const s = bs();
    expect(s.tieOut).toBeNull();
  });
});
