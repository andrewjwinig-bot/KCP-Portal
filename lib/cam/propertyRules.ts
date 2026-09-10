// Property-level overrides for CAM / INS / RET pro-rata share denominators
// and tenant-level exclusions.
//
// True PRS = unit sqft ÷ building GLA × 100. For most properties that's
// the right denominator for every category. But some centers carve out
// specific tenants from specific categories — e.g. an outparcel pad
// (Wawa at Brookwood) maintains its own lot and doesn't share CAM, while
// a bank tenant carries its own insurance. In those cases the *other*
// tenants' PRS for that category is computed against a reduced
// denominator (full GLA minus the carved-out tenants' sqft), and the
// carved-out tenants pay nothing for that category at all.
//
// This file encodes those rules per property. The CAM card on each
// unit detail page reads from here to pre-fill each PRS column with
// the right denominator and to display a footnote explaining the carve-out.

import type { CamCategory } from "./config";

export type CamCategoryRule = {
  /** Default denominator for non-excluded tenants in this category. */
  denominator: number;
  /** Tenant occupant-name substrings (case-insensitive) that don't pay
   *  this category at all. Their PRS for this category is forced to 0. */
  excludeTenantPatterns?: string[];
  /** Tenant occupant-name substrings (case-insensitive) whose denominator
   *  differs from the default. E.g. Wawa pays insurance on the full GLA
   *  even though other tenants split the reduced denominator. */
  tenantOverrides?: Array<{ pattern: string; denominator: number }>;
  /** Footnote shown under the PRS row on the CAM card when this category
   *  has any carve-out. Rendered with a leading "*". */
  footnote?: string;
};

export type PropertyCamRule = Partial<Record<CamCategory, CamCategoryRule>>;

/** Indexed by propertyCode (matches PROPERTY_DEFS[i].id). */
export const PROPERTY_CAM_RULES: Record<string, PropertyCamRule> = {
  // Brookwood Shopping Center — full GLA 61,572 sf.
  //   • Wawa is an outparcel: maintains its own lot, pays no CAM.
  //   • M&T Bank carries its own insurance, pays no INS.
  //   • Wawa's insurance is still on the full GLA (lease quirk).
  //   • RET is on the full GLA for everyone.
  "2300": {
    cam: {
      denominator: 56572,
      excludeTenantPatterns: ["wawa"],
      footnote: "CAM denominator excludes Wawa outparcel.",
    },
    ins: {
      denominator: 48772,
      excludeTenantPatterns: ["m&t", "m & t", "dunkin"],
      tenantOverrides: [{ pattern: "wawa", denominator: 61572 }],
      footnote: "Insurance denominator excludes Wawa outparcel, M&T Bank and Dunkin (Wawa's insurance is on full GLA).",
    },
    // RET intentionally omitted → falls back to building GLA for everyone.
  },
  // Gray's Ferry Shopping Center — full GLA 82,809 sf.
  //   • McDonald's is an outparcel pad: carries its own insurance (no INS),
  //     so the INS denominator excludes its 3,675 sf → 79,134.
  //   • USPS recovers RET only (no CAM / INS).
  //   • Victra's RET share uses the reduced 79,134 GLA (excludes the
  //     McDonald's outparcel building) per its lease.
  "4500": {
    cam: {
      denominator: 82809,
      excludeTenantPatterns: ["usps"],
      footnote: "USPS recovers RET only — no CAM.",
    },
    ins: {
      denominator: 79134,
      excludeTenantPatterns: ["mcdonald", "usps"],
      footnote: "Insurance denominator excludes the McDonald's outparcel; USPS and McDonald's pay no INS.",
    },
    ret: {
      denominator: 82809,
      tenantOverrides: [{ pattern: "victra", denominator: 79134 }],
      footnote: "Victra's RET share uses the reduced GLA (excludes the McDonald's outparcel building).",
    },
  },
  // Parkwood Shopping/Office Center (7010) — mixed retail + office.
  //   • Retail CAM/INS over the 61,036 sf CAM GLA; RET over the 73,215 sf
  //     leasable GLA. Pad tenants carry their own CAM GLA (Forge 73,215,
  //     Trumark 76,608); a few carry their own INS GLA (40,388); Wawa & Dunkin
  //     pay no INS. Office (Parkwood Medical) is over the 12,179 sf office GLA.
  "7010": {
    cam: {
      denominator: 61036,
      tenantOverrides: [
        { pattern: "forge", denominator: 73215 },
        { pattern: "trumark", denominator: 76608 },
        { pattern: "parkwood medical", denominator: 12179 },
      ],
    },
    ins: {
      denominator: 61036,
      excludeTenantPatterns: ["wawa", "dunkin"],
      tenantOverrides: [
        { pattern: "forge", denominator: 73215 },
        { pattern: "petroski", denominator: 40388 },
        { pattern: "hair wizards", denominator: 40388 },
        { pattern: "zen", denominator: 40388 },
        { pattern: "we rock", denominator: 40388 },
        { pattern: "parkwood medical", denominator: 12179 },
      ],
    },
    ret: {
      denominator: 73215,
      tenantOverrides: [{ pattern: "parkwood medical", denominator: 12179 }],
    },
  },
};

function matchesPattern(occupantName: string, pattern: string): boolean {
  return occupantName.toLowerCase().includes(pattern.toLowerCase());
}

/** Returns the denominator a given tenant should use for a given category
 *  at a given property. Falls back to `fallbackBuildingSqft` (full GLA)
 *  when no rule applies. */
export function getCategoryDenominator(
  propertyCode: string,
  category: CamCategory,
  occupantName: string,
  fallbackBuildingSqft: number,
): number {
  const rule = PROPERTY_CAM_RULES[propertyCode]?.[category];
  if (!rule) return fallbackBuildingSqft;
  const override = rule.tenantOverrides?.find((o) => matchesPattern(occupantName, o.pattern));
  if (override) return override.denominator;
  return rule.denominator;
}

/** True when this tenant is carved out of this category entirely (pays
 *  nothing). Their PRS should be forced to 0 and the input disabled. */
export function isTenantExcluded(
  propertyCode: string,
  category: CamCategory,
  occupantName: string,
): boolean {
  const rule = PROPERTY_CAM_RULES[propertyCode]?.[category];
  if (!rule?.excludeTenantPatterns?.length) return false;
  return rule.excludeTenantPatterns.some((p) => matchesPattern(occupantName, p));
}

/** Footnote text to show under the PRS row for a category at this
 *  property, or null when no footnote applies. */
export function getCategoryFootnote(
  propertyCode: string,
  category: CamCategory,
): string | null {
  return PROPERTY_CAM_RULES[propertyCode]?.[category]?.footnote ?? null;
}
