// Enrich a budget workbook with lease dates from the portal's stored
// rent roll. The workbook only carries lease windows for tenants on
// the Renew & Vac tab (i.e. leases expiring within the budget year);
// in-place tenants whose leases run past year-end need the dates from
// the rent roll snapshot. Mutates the workbook in place — call before
// returning from the API route.

import "server-only";
import { getJSON } from "@/lib/storage";
import type { BudgetWorkbook } from "./types";

type RentRollUnit = {
  unitRef?: string;
  occupantName?: string;
  leaseFrom?: string | null;
  leaseTo?: string | null;
};
type RentRollProperty = {
  propertyCode?: string;
  units?: RentRollUnit[];
};
type RentRoll = {
  properties?: RentRollProperty[];
};

const RENTROLL_PREFIX = "rentroll";
const RENTROLL_ID = "current";

function normSuite(s: string | undefined | null): string {
  return (s ?? "").trim().toUpperCase();
}

export async function enrichWithRentRollDates(wb: BudgetWorkbook): Promise<void> {
  const rr = await getJSON(RENTROLL_PREFIX, RENTROLL_ID) as RentRoll | null;
  if (!rr?.properties?.length) return;

  // Build a per-property unitRef → { from, to } lookup.
  const byProperty = new Map<string, Map<string, { from?: string; to?: string }>>();
  for (const prop of rr.properties) {
    const code = (prop.propertyCode ?? "").toUpperCase();
    if (!code) continue;
    const map = new Map<string, { from?: string; to?: string }>();
    for (const u of prop.units ?? []) {
      const ref = normSuite(u.unitRef);
      if (!ref) continue;
      map.set(ref, {
        from: u.leaseFrom ?? undefined,
        to:   u.leaseTo   ?? undefined,
      });
    }
    if (map.size > 0) byProperty.set(code, map);
  }
  if (byProperty.size === 0) return;

  for (const property of wb.properties) {
    const lookup = byProperty.get(property.propertyCode.toUpperCase());
    if (!lookup) continue;
    for (const section of property.sections) {
      for (const line of section.lines) {
        if (!line.rentDetail) continue;
        for (const entry of line.rentDetail.entries) {
          // Only fill in what's missing — the R&V tab's dates are the
          // canonical "this lease expires this year" record, so don't
          // overwrite them.
          if (entry.leaseFrom && entry.leaseTo) continue;
          const hit = lookup.get(normSuite(entry.unitRef));
          if (!hit) continue;
          if (!entry.leaseFrom && hit.from) entry.leaseFrom = hit.from;
          if (!entry.leaseTo   && hit.to)   entry.leaseTo   = hit.to;
        }
      }
    }
  }
}
