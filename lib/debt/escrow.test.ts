import { describe, it, expect } from "vitest";
import {
  monthlyOutlay, escrowAt, summarizeLoan,
  BROOKWOOD_2300_LOAN, PARKWOOD_7010_LOAN, GRAYS_FERRY_4500_LOAN, NI_LLC_4000_LOAN, JV_III_3600_LOAN,
} from "./amortization";

/**
 * The Liberty escrow reset, effective 10/2026.
 *
 * Escrow is NOT debt service — it pays the tax bill and the insurance
 * premium, and never touches the balance, the interest or the payoff. It is
 * tracked because it leaves the bank account: budgeting from `scheduledPayment`
 * alone is short by it every single month.
 *
 * The totals are asserted against the bank's own letters, so a future edit to
 * either component has to still reconcile to the figure the bank will debit.
 */
describe("Liberty escrow reset, effective 10/2026", () => {
  it("2300 Brookwood: P&I unchanged, total debit $39,086.15", () => {
    expect(BROOKWOOD_2300_LOAN.scheduledPayment).toBe(25031.18);
    expect(BROOKWOOD_2300_LOAN.escrowPerMonth).toBe(14054.97);
    expect(monthlyOutlay(BROOKWOOD_2300_LOAN, BROOKWOOD_2300_LOAN.scheduledPayment)).toBe(39086.15);
  });

  it("7010 Parkwood: P&I unchanged, total debit $36,951.74", () => {
    expect(PARKWOOD_7010_LOAN.scheduledPayment).toBe(23779.62);
    expect(PARKWOOD_7010_LOAN.escrowPerMonth).toBe(13172.12);
    expect(monthlyOutlay(PARKWOOD_7010_LOAN, PARKWOOD_7010_LOAN.scheduledPayment)).toBe(36951.74);
  });

  it("does not count escrow before the reset takes effect", () => {
    // Asked for a date before the bank's effective date, the outlay is still
    // debt service alone — a projection must not spend money that is not yet
    // being collected.
    const pi = BROOKWOOD_2300_LOAN.scheduledPayment;
    expect(monthlyOutlay(BROOKWOOD_2300_LOAN, pi, "2026-09-30")).toBe(25031.18);
    expect(monthlyOutlay(BROOKWOOD_2300_LOAN, pi, "2026-10-01")).toBe(39086.15);
  });

  it("is debt service alone on a loan with no escrow", () => {
    const noEscrow = { ...BROOKWOOD_2300_LOAN, escrowPerMonth: undefined, escrowEffective: undefined };
    expect(monthlyOutlay(noEscrow, noEscrow.scheduledPayment)).toBe(25031.18);
  });

  it("leaves the amortization untouched", () => {
    // The whole point: a tax/insurance pass-through changes what leaves the
    // account and nothing about what is owed.
    expect(BROOKWOOD_2300_LOAN.anchorBalance).toBe(4228154.76);
    expect(BROOKWOOD_2300_LOAN.annualRatePct).toBe(3.5);
    expect(BROOKWOOD_2300_LOAN.maturityDate).toBe("2027-09-01");
  });
});

describe("4500 Grays Ferry", () => {
  it("total debit $60,714.46", () => {
    expect(GRAYS_FERRY_4500_LOAN.escrowPerMonth).toBe(15416.63);
    // The bank's letter states P&I at $45,297.83, one cent above the
    // $45,297.82 carried on the statements. The cent is recorded in the notes
    // rather than silently changing the amortization input.
    expect(monthlyOutlay(GRAYS_FERRY_4500_LOAN, 45297.83)).toBe(60714.46);
  });
});

describe("4000 Neshaminy Interplex — the amendment case", () => {
  it("does NOT use scheduledPayment as debt service", () => {
    // Its `scheduledPayment` is the ORIGINAL P&I and is not paid at all:
    // the loan is interest-only under a fixed-principal amendment. Treating
    // that number as the payment overstates the outlay by six figures.
    expect(NI_LLC_4000_LOAN.scheduledPayment).toBe(153376.33);
    expect(NI_LLC_4000_LOAN.interestOnly).toBe(true);
    expect(NI_LLC_4000_LOAN.amendment?.principalPerMonth).toBe(20050);
  });

  it("bills principal + escrow + interest ON TOP", () => {
    // The bank's letter reads "$59,094.39, plus interest" — principal and
    // escrow only. Interest is charged above it, so the real debit is far
    // larger and moves as the balance amortizes.
    const principalPlusEscrow = 20050 + 39044.39;
    expect(principalPlusEscrow).toBeCloseTo(59094.39, 2);

    const s = summarizeLoan(NI_LLC_4000_LOAN, "2026-10-01");
    const outlay = monthlyOutlay(NI_LLC_4000_LOAN, s.monthlyDebtService, "2026-10-01");
    // Debt service under the amendment is principal + interest, so the total
    // outlay must exceed the letter's figure by roughly a month's interest.
    expect(outlay).toBeGreaterThan(principalPlusEscrow + 80000);
    expect(s.monthlyDebtService).toBeGreaterThan(20050);
  });

  it("carries the escrow the letter states", () => {
    expect(escrowAt(NI_LLC_4000_LOAN, "2026-10-01")).toBe(39044.39);
    expect(escrowAt(NI_LLC_4000_LOAN, "2026-09-01")).toBe(0);
  });
});

describe("3600 Lincoln JV III — interest-only, no principal", () => {
  it("bills interest plus escrow, with no principal component", () => {
    // The letter states no total: "payment will be for interest and escrow".
    // Interest moves with the balance, so there is no fixed figure to assert
    // — only that debt service is interest and carries no principal.
    expect(JV_III_3600_LOAN.interestOnly).toBe(true);
    expect(JV_III_3600_LOAN.amendment).toBeUndefined();
    expect(escrowAt(JV_III_3600_LOAN, "2026-10-01")).toBe(11908.90);

    const s = summarizeLoan(JV_III_3600_LOAN, "2026-10-01");
    expect(s.nextPayment?.principal ?? 0).toBe(0);
    const outlay = monthlyOutlay(JV_III_3600_LOAN, s.monthlyDebtService, "2026-10-01");
    expect(outlay).toBe(round2(s.monthlyDebtService + 11908.90));
  });

  it("never treats scheduledPayment as the billed amount", () => {
    // $39,464.11 is the ORIGINAL amortizing payment and is not billed at all
    // while the loan is interest-only.
    const s = summarizeLoan(JV_III_3600_LOAN, "2026-10-01");
    expect(JV_III_3600_LOAN.scheduledPayment).toBe(39464.11);
    expect(s.monthlyDebtService).toBeLessThan(JV_III_3600_LOAN.scheduledPayment);
  });
});

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
