// CAM/INS/RET reimbursement estimate for the budget draft (Phase 3, DISPLAY-ONLY).
//
// Reuses the real reconciliation engine — every documented special case (PRS,
// admin fee, exclusions, gross leases, the property INS pool, Wawa@Brookwood,
// mixed centers) is already baked into its per-tenant result — and scales that
// building's most recent recon to the budget year by the expense growth
// assumption. Produces each tenant's estimated annual + monthly CAM/INS/RET and
// the building rollup that WOULD feed the reimbursement income lines.
//
// This is a PREVIEW: it does not drive the budget's reimbursement lines or write
// any rent-roll escrow assumption yet — the numbers are surfaced so they can be
// verified against a real recon before they're wired in.

import "server-only";
import { RETAIL_RECON_FIXTURES } from "@/lib/cam/retail/registry";
import { OFFICE_RECON_FIXTURES } from "@/lib/cam/office/registry";
import { loadRetailRecon } from "@/lib/cam/retail/loadResult";
import { loadOfficeRecon } from "@/lib/cam/office/loadResult";

const r0 = (n: number) => Math.round(n);

export type ReimbTenantEstimate = {
  unitRef: string;
  name: string;
  camAnnual: number; insAnnual: number; retAnnual: number;
  camMonthly: number; insMonthly: number; retMonthly: number;
};

export type ReimbursementEstimate = {
  kind: "retail" | "office";
  propertyCode: string;
  /** The recon year the estimate was scaled from. */
  reconYear: number;
  budgetYear: number;
  growthPct: number;
  /** (1 + growth%)^(budgetYear − reconYear). */
  factor: number;
  tenants: ReimbTenantEstimate[];
  totals: { camAnnual: number; insAnnual: number; retAnnual: number };
};

function latestYear(byYear: Record<number, unknown> | undefined): number | null {
  const ys = Object.keys(byYear ?? {}).map(Number).filter((n) => Number.isFinite(n));
  return ys.length ? Math.max(...ys) : null;
}

/** Estimate a property's tenant CAM/INS/RET recoveries for `budgetYear`, or null
 *  when the property has no recon fixture (reimbursements stay as-is). */
export async function estimateReimbursements(code: string, budgetYear: number, growthPct: number): Promise<ReimbursementEstimate | null> {
  const retail = RETAIL_RECON_FIXTURES[code];
  const office = OFFICE_RECON_FIXTURES[code];
  const kind: "retail" | "office" | null = retail ? "retail" : office ? "office" : null;
  if (!kind) return null;

  const reconYear = latestYear((retail ?? office)?.byYear as Record<number, unknown>);
  if (reconYear == null) return null;

  const factor = Math.pow(1 + (growthPct || 0) / 100, Math.max(0, budgetYear - reconYear));
  const tenants: ReimbTenantEstimate[] = [];

  if (kind === "retail") {
    const loaded = await loadRetailRecon(code, reconYear);
    if (!loaded) return null;
    for (const t of loaded.result.tenants) {
      const cam = t.camDue * factor, ins = t.insDue * factor, ret = t.retDue * factor;
      tenants.push({
        unitRef: t.unitRef, name: t.name,
        camAnnual: r0(cam), insAnnual: r0(ins), retAnnual: r0(ret),
        camMonthly: r0(cam / 12), insMonthly: r0(ins / 12), retMonthly: r0(ret / 12),
      });
    }
  } else {
    const loaded = await loadOfficeRecon(code, reconYear);
    if (!loaded) return null;
    for (const t of loaded.result.tenants) {
      const cam = t.opexAmountDue * factor, ret = t.retAmountDue * factor;
      tenants.push({
        unitRef: t.unitRef, name: t.name,
        camAnnual: r0(cam), insAnnual: 0, retAnnual: r0(ret),
        camMonthly: r0(cam / 12), insMonthly: 0, retMonthly: r0(ret / 12),
      });
    }
  }

  const totals = tenants.reduce(
    (a, t) => { a.camAnnual += t.camAnnual; a.insAnnual += t.insAnnual; a.retAnnual += t.retAnnual; return a; },
    { camAnnual: 0, insAnnual: 0, retAnnual: 0 },
  );
  return { kind, propertyCode: code, reconYear, budgetYear, growthPct, factor: Math.round(factor * 10000) / 10000, tenants, totals };
}
