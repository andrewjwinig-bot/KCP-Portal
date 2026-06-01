// Registry of office reconciliation fixtures. Today this is the 4070
// workbook seed; as each building's "Expenses & Occ" import and December
// rent roll come online, the pool + tenant inputs will be sourced live and
// this registry becomes the fallback / fixture set the tie-out tests use.

import type { OfficeExpensePool, OfficeTenantInput } from "./types";
import { POOL_4070, TENANTS_4070_2025 } from "./seed/4070";

export type OfficeReconFixture = {
  propertyCode: string;
  name: string;
  pool: OfficeExpensePool;
  /** Tenant inputs keyed by reconciliation year. */
  tenantsByYear: Record<number, OfficeTenantInput[]>;
};

export const OFFICE_RECON_FIXTURES: Record<string, OfficeReconFixture> = {
  "4070": {
    propertyCode: "4070",
    name: "Building 7",
    pool: POOL_4070,
    tenantsByYear: { 2025: TENANTS_4070_2025 },
  },
};

export function availableOfficeRecons(): { propertyCode: string; name: string; years: number[] }[] {
  return Object.values(OFFICE_RECON_FIXTURES).map((f) => ({
    propertyCode: f.propertyCode,
    name: f.name,
    years: Object.keys(f.tenantsByYear).map(Number).sort((a, b) => b - a),
  }));
}
