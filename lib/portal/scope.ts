// Pure scoping predicates for the signed tenant-portal history endpoints.
// A portal token authorizes exactly ONE tenant (their company + unit), so these
// decide which service requests / reservations belong to that tenant. Kept as
// pure functions so the "no cross-tenant leakage" rule is unit-testable.

export const normCompany = (s: string): string => s.trim().toLowerCase();

export type PortalScope = {
  /** The tenant's company name (from the rent-roll occupant). */
  company: string;
  /** The token's property code. */
  propertyCode: string;
  /** The token's unit ref. */
  unitRef: string;
};

/** A service request belongs to the tenant if it was filed under their company
 *  (case-insensitive) OR against their exact unit on their property. An empty
 *  company never matches — otherwise every company-less record would leak. */
export function serviceRequestMatchesTenant(
  r: { tenantCompany: string; propertyCode: string | null; tenantSuite: string },
  tenant: PortalScope,
): boolean {
  const company = normCompany(tenant.company);
  const byCompany = !!company && normCompany(r.tenantCompany) === company;
  const bySuite =
    !!tenant.propertyCode &&
    r.propertyCode === tenant.propertyCode &&
    !!tenant.unitRef &&
    r.tenantSuite.split(/[,\s]+/).filter(Boolean).includes(tenant.unitRef);
  return byCompany || bySuite;
}

/** A reservation belongs to the tenant when it was booked under their company
 *  (case-insensitive). An empty company never matches. */
export function reservationMatchesTenant(
  v: { tenantCompany: string },
  tenant: Pick<PortalScope, "company">,
): boolean {
  const company = normCompany(tenant.company);
  return !!company && normCompany(v.tenantCompany) === company;
}
