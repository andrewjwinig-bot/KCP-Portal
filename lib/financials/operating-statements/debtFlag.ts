import "server-only";
import { mortgagePaymentsFor, mortgageSplitsFor, type PaymentSplit } from "@/lib/financials/cash-sheet/mortgage";
import { addAnticipated } from "./compute";
import type { PropertyStatement, StatementLine, StatementSection } from "./types";

/**
 * When the Debt Tracker schedules P&I on a property this month and $0 debt
 * service is posted, the payment is FILLED IN as anticipated (owner: "its just
 * misleading to look at the income when we know theres debt") — interest on
 * the interest line, principal on the amortization line — so the debt-service
 * total and cash flow after debt service carry it. Each filled line keeps its
 * not-posted finding (`expectedMissing.anticipated`): the cell shows the figure
 * on the amber not-posted fill, and it still counts as an item to investigate.
 * Mutates the statement and returns the debt check (scheduled / posted /
 * missing). Shared by the on-screen statement route, the Excel/PDF export
 * loader and the Review, so all three read the same figures.
 */
export { mortgagePaymentsFor };

/** Split a month's payment across the debt-service lines that posted nothing:
 *  interest to an interest line, principal to an amortization / principal
 *  line; with one line (or no match), the whole payment on the first. */
export function anticipatedSplit(
  lines: { label: string }[],
  split: PaymentSplit,
): number[] {
  const out = lines.map(() => 0);
  if (!lines.length) return out;
  const iInt = lines.findIndex((l) => /interest/i.test(l.label));
  const iPrin = lines.findIndex((l) => /amortiz|principal/i.test(l.label));
  if (iInt >= 0 && iPrin >= 0 && iInt !== iPrin) {
    out[iInt] = Math.round(split.interest);
    out[iPrin] = Math.round(split.payment) - Math.round(split.interest);
  } else {
    out[iInt >= 0 ? iInt : iPrin >= 0 ? iPrin : 0] = Math.round(split.payment);
  }
  return out;
}

export async function markMissingDebt(
  statement: PropertyStatement,
  key: string,
  propertyCode: string | null | undefined,
  year: number,
  period: number,
  /** The month's schedule, when the caller already has it — the cross-property
   *  Review asks every month of every property and reads the loans once. */
  preloaded?: Record<string, number>,
  /** A line whose not-posted warning was dismissed is left as posted ($0). */
  skip?: (sectionName: string, label: string) => boolean,
  preloadedSplits?: Record<string, PaymentSplit>,
): Promise<{ scheduled: number; posted: number; missing: boolean }> {
  const debtByCode = preloaded ?? await mortgagePaymentsFor(year, period);
  const codeKey = debtByCode[key.toUpperCase()] != null ? key.toUpperCase() : (propertyCode || "").toUpperCase();
  const scheduled = debtByCode[codeKey] ?? 0;
  let posted = 0;
  for (const sec of statement.sections) {
    if (sec.role === "debt-service") for (const l of sec.lines) posted += l.periodActual;
  }
  const missing = scheduled > 0 && Math.round(posted) === 0;
  if (!missing) return { scheduled, posted, missing };

  const zero: { sec: StatementSection; line: StatementLine }[] = [];
  for (const sec of statement.sections) {
    if (sec.role !== "debt-service") continue;
    for (const l of sec.lines) {
      if (Math.round(l.periodActual) === 0) zero.push({ sec, line: l });
    }
  }
  const split = (preloadedSplits ?? await mortgageSplitsFor(year, period))[codeKey]
    ?? { payment: scheduled, interest: scheduled, principal: 0 };
  const amounts = anticipatedSplit(zero.map((z) => z.line), split);
  // Split across every unposted line FIRST, so a dismissed interest line does
  // not hand its share to the amortization line; then leave the dismissed out.
  zero.forEach(({ sec, line }, i) => {
    if (skip?.(sec.name, line.label)) return;
    const amount = amounts[i];
    if (amount) addAnticipated(statement, sec, line, amount);
    line.expectedMissing = { expected: scheduled, basis: "debt", scope: "period", ...(amount ? { anticipated: amount } : {}) };
  });
  return { scheduled, posted, missing };
}
