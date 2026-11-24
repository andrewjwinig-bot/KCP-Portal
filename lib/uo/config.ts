// PHILADELPHIA USE & OCCUPANCY TAX — what the portal knows about each return
// (owner, 11/2026: "update our U&O calculations for philly … integrate as
// much as possible and be as autonomous as possible"). Client-safe: no
// storage, no secrets.
//
// The City bills the landlord a MAXIMUM tax per OPA parcel each month —
// assessed value × 1.21% ÷ 12 (Line 1 of the UO1) — and the landlord passes it
// to tenants by square feet. What is not collected comes off the return:
// vacant space (Line 2), exempt tenants and common area (Line 3), tenants
// reported delinquent on the UO3 (Line 8). Paid by the 25th, the landlord
// keeps 1% (Line 10).
//
// One RETURN per parcel the City has a U&O account for. 4500 Grays Ferry is
// two: the centre (882051606) and the rear parcel (874545940), which has no
// tenants and files as wholly vacant every month.
//
// NEVER in the portal: the City tax account numbers, PINs, tenant EINs /
// SSNs or the bank details — they stay in the U&O folder on the share drive.

/** The U&O rate on assessed value (1.21% since 7/1/2015). */
export const UO_RATE = 0.0121;
/** Landlord's discount for filing and paying by the 25th. */
export const UO_DISCOUNT_PCT = 1;
/** The day the return and payment are due each month. */
export const UO_DUE_DAY = 25;
/** The day the delinquent review opens (the filing instructions' "about the
 *  16th" — on the next work day when it falls on a weekend). */
export const UO_REVIEW_DAY = 16;
/** File by about the 21st: every Philadelphia landlord files on the 25th and
 *  the City site slows down. */
export const UO_FILE_BY_DAY = 21;

/** The JE that records the payment — Skyline's Standard JE Import, as the
 *  "ShopCtrs U&O direct debit" workbook carries it. */
export const UO_JE = {
  cash: "0110-0000",     // paid to the City (negative)
  payable: "2430-0000",  // U&O collected from tenants, before the discount (positive)
  discount: "9190-8501", // the 1% kept (negative)
  /** Column D of the import — the code the team's workbook carries. */
  source: "LT",
};

export type UoAccount = {
  /** OPA parcel number — public; the City's tax account number is not kept. */
  parcel: string;
  label: string;
  /** The parcel has no tenants: the whole maximum tax is vacant every month. */
  noTenants?: boolean;
};

export type UoCommonArea = { label: string; sqft: number };

export type UoProperty = {
  code: string;
  accounts: UoAccount[];
  /** Space on the City's allocation the rent roll does not carry (7010's
   *  hallway) — always exempt (Line 3). */
  commonAreas?: UoCommonArea[];
};

export const UO_PROPERTIES: UoProperty[] = [
  { code: "1100", accounts: [{ parcel: "882077811", label: "Parkwood Professional Bldg" }] },
  { code: "1500", accounts: [{ parcel: "882057700", label: "2448 Island Ave" }] },
  {
    code: "4500",
    accounts: [
      { parcel: "882051606", label: "Shopping Center" },
      { parcel: "874545940", label: "Rear Parcel", noTenants: true },
    ],
  },
  { code: "5600", accounts: [{ parcel: "882830600", label: "Post Office" }] },
  {
    code: "7010",
    accounts: [{ parcel: "882078060", label: "Shopping Center" }],
    // On every 7010 calculation sheet since 2017; the rent roll has no row for it.
    commonAreas: [{ label: "Hallway", sqft: 2227 }],
  },
  { code: "7200", accounts: [{ parcel: "882832400", label: "Shopping Center" }] },
  { code: "7300", accounts: [{ parcel: "882138000", label: "Shopping Center" }] },
  { code: "8200", accounts: [{ parcel: "882047230", label: "Four Seasons" }] },
];

export const uoProperty = (code: string) => UO_PROPERTIES.find((p) => p.code === String(code).toUpperCase()) ?? null;

/** Who the City does not tax: governments (federal, state, city, school
 *  district), credit unions and nonprofits. Read off the tenant's name as a
 *  SUGGESTION — the page shows the reason and anyone can switch it off. */
const EXEMPT_NAME_RULES: [RegExp, string][] = [
  [/\bpostal service\b|\busps\b/i, "Federal (Postal Service)"],
  [/\bcredit union\b|\bf\.?c\.?u\.?\b|\btrumark\b/i, "Credit union"],
  [/\bliquor control\b|\bplcb\b|\bpennsylvania lcb\b|fine wine/i, "Commonwealth (PLCB)"],
  [/\bsenator\b|\brepresentative\b|\bcommonwealth of\b/i, "Commonwealth office"],
  [/\bcity of philadelphia\b|\bschool district\b|\bfree library\b/i, "City / School District"],
];

export function suggestedExemption(tenant: string): string | null {
  for (const [re, why] of EXEMPT_NAME_RULES) if (re.test(tenant)) return why;
  return null;
}

/** Exemptions the City already accepts that a name cannot show (a nonprofit),
 *  read off the filed returns. Laid under the stored settings. */
export const SEEDED_EXEMPT: Record<string, string> = {
  // North Inc is on 7010's October 2026 return as exempt ($579 of the $1,479).
  "7010-12347": "Nonprofit (on the October 2026 return)",
};
