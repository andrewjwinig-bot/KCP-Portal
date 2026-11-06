import "server-only";
import { OFFICE_RECON_FIXTURES } from "@/lib/cam/office/registry";
import { RETAIL_RECON_FIXTURES } from "@/lib/cam/retail/registry";

// Years for which a given unit has a CAM/RET reconciliation, newest first.
// Cheap roster-membership check against the seeded fixtures (no compute) — for
// office, a unit deliberately excluded from the reconciliation (gross leases,
// amenities, former tenants) is dropped so it isn't offered a statement.
export function statementYearsForUnit(
  kind: "office" | "retail",
  property: string,
  unitRef: string,
): number[] {
  if (kind === "office") {
    const fx = OFFICE_RECON_FIXTURES[property];
    if (!fx) return [];
    return Object.entries(fx.byYear)
      .filter(([, y]) => y.roster.some((u) => u.unitRef === unitRef) && !y.excludedUnits?.[unitRef])
      .map(([yr]) => Number(yr))
      .sort((a, b) => b - a);
  }
  const fx = RETAIL_RECON_FIXTURES[property];
  if (!fx) return [];
  return Object.entries(fx.byYear)
    .filter(([, y]) => y.roster.some((u) => u.unitRef === unitRef))
    .map(([yr]) => Number(yr))
    .sort((a, b) => b - a);
}
