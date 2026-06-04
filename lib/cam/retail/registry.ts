// Registry of retail reconciliation fixtures (the retail counterpart to the
// office registry). Each fixture exposes the building's expense pool and, per
// reconciliation year, the rent-roll roster (SF, escrow billed, RET discount).
// The route assembles tenant inputs by joining the roster to propertyRules PRS
// + the stored CAM config, then reconciles.

import type { RetailExpensePool } from "./types";
import type { RetailRosterUnit } from "./assemble";
import { POOL_2300, ROSTER_2300_2025 } from "./seed/2300";
import { POOL_1100, ROSTER_1100_2025 } from "./seed/1100";
import { POOL_4500, ROSTER_4500_2025 } from "./seed/4500";
import { POOL_7010_RETAIL, ROSTER_7010_RETAIL_2025 } from "./seed/7010-retail";
import { POOL_7010_OFFICE, ROSTER_7010_OFFICE_2025 } from "./seed/7010-office";

export type RetailReconYear = { roster: RetailRosterUnit[] };

export type RetailReconFixture = {
  propertyCode: string;
  name: string;
  /** Full building GLA — the RET denominator fallback. */
  gla: number;
  pool: RetailExpensePool;
  byYear: Record<number, RetailReconYear>;
  /** Mixed center: code of the office-part fixture rendered as a sub-tab. */
  mixedOfficeCode?: string;
  /** Hidden from the dropdown (reached only as a mixed-center sub-tab). */
  hidden?: boolean;
};

export const RETAIL_RECON_FIXTURES: Record<string, RetailReconFixture> = {
  "1100": {
    propertyCode: "1100",
    name: "Parkwood Professional Center",
    gla: 8287,
    pool: POOL_1100,
    byYear: { 2025: { roster: ROSTER_1100_2025 } },
  },
  "2300": {
    propertyCode: "2300",
    name: "Brookwood Shopping Center",
    gla: 61572,
    pool: POOL_2300,
    byYear: { 2025: { roster: ROSTER_2300_2025 } },
  },
  "4500": {
    propertyCode: "4500",
    name: "Gray's Ferry Shopping Center",
    gla: 82809,
    pool: POOL_4500,
    byYear: { 2025: { roster: ROSTER_4500_2025 } },
  },
  // 7010 is a mixed center — retail + office reconciliations sharing the
  // building, shown on one page with Retail / Office sub-tabs. Both pools carry
  // propertyCode "7010" so unit links + the allocation breakdown resolve. The
  // office part ("7010O") is hidden from the dropdown and fetched as a sub-tab.
  "7010": {
    propertyCode: "7010",
    name: "Parkwood Shopping/Office Center",
    gla: 61036,
    pool: POOL_7010_RETAIL,
    byYear: { 2025: { roster: ROSTER_7010_RETAIL_2025 } },
    mixedOfficeCode: "7010O",
  },
  "7010O": {
    propertyCode: "7010O",
    name: "Parkwood SC (Office)",
    gla: 12179,
    pool: POOL_7010_OFFICE,
    byYear: { 2025: { roster: ROSTER_7010_OFFICE_2025 } },
    hidden: true,
  },
};

export function availableRetailRecons(): { propertyCode: string; name: string; years: number[]; mixedOfficeCode?: string }[] {
  return Object.values(RETAIL_RECON_FIXTURES)
    .filter((f) => !f.hidden)
    .map((f) => ({
      propertyCode: f.propertyCode,
      name: f.name,
      years: Object.keys(f.byYear).map(Number).sort((a, b) => b - a),
      mixedOfficeCode: f.mixedOfficeCode,
    }));
}
