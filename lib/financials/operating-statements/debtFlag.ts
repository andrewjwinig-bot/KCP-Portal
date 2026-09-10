import "server-only";
import { mortgagePaymentsFor } from "@/lib/financials/cash-sheet/mortgage";
import type { PropertyStatement } from "./types";

/**
 * Mark a property's debt-service line(s) as "expected but not posted" when the
 * Debt Tracker schedules P&I on the property this month but $0 debt service is
 * posted to the GL. Mutates the statement in place and returns the debt check
 * (scheduled / posted / missing). Shared by the on-screen statement route and
 * the Excel/PDF export loader so both flag the missing debt identically.
 */
export async function markMissingDebt(
  statement: PropertyStatement,
  key: string,
  propertyCode: string | null | undefined,
  year: number,
  period: number,
): Promise<{ scheduled: number; posted: number; missing: boolean }> {
  const debtByCode = await mortgagePaymentsFor(year, period);
  const scheduled = debtByCode[key.toUpperCase()] ?? debtByCode[(propertyCode || "").toUpperCase()] ?? 0;
  let posted = 0;
  for (const sec of statement.sections) {
    if (sec.role === "debt-service") for (const l of sec.lines) posted += l.periodActual;
  }
  const missing = scheduled > 0 && Math.round(posted) === 0;
  if (missing) {
    for (const sec of statement.sections) {
      if (sec.role !== "debt-service") continue;
      for (const l of sec.lines) {
        if (Math.round(l.periodActual) === 0) {
          l.expectedMissing = { expected: scheduled, basis: "debt", scope: "period" };
        }
      }
    }
  }
  return { scheduled, posted, missing };
}
