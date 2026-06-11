// Master list of unique bank accounts as tracked in the Bank Rec spreadsheet.
// Source of truth for the Bank Rec Tracker. Keep in spreadsheet order within
// each bank group so the on-screen order mirrors what Marie sees in Excel.

export type BankGroup = "M&T" | "JPM-Chase" | "Liberty Bank";

export interface UniqueBankAccount {
  bank: BankGroup;
  /** "Bank Account Key" column — internal nickname, e.g. "M&T 4900", "JPM 3610". */
  key: string;
  /** Trailing-digits label, e.g. "x3777". */
  last4: string;
  /** Display name from the "Account Name" column. */
  accountName: string;
  /** Associated property / entity code, shown next to the account in pickers. */
  propertyCode?: string;
}

export const UNIQUE_BANK_ACCOUNTS: UniqueBankAccount[] = [
  // ── M&T ───────────────────────────────────────────────────────────
  { bank: "M&T",         key: "M&T 4900",        last4: "x3777", accountName: "Office Works Partnership", propertyCode: "4900" },
  { bank: "M&T",         key: "M&T 150 920",     last4: "x4031", accountName: "Eastwick Joint Venture", propertyCode: "1500/9200" },
  { bank: "M&T",         key: "M&T 2070",        last4: "x6119", accountName: "Kosano Associates LP", propertyCode: "2070" },
  { bank: "M&T",         key: "M&T 204 208",     last4: "x6127", accountName: "KF Nockamixon LLC" },
  { bank: "M&T",         key: "M&T 2000 Clear",  last4: "x6055", accountName: "LIK Management Inc", propertyCode: "2010" },
  { bank: "M&T",         key: "M&T 2-3-9-42-44", last4: "x6063", accountName: "TKD-Neshaminy LLC" },

  // ── JPM-Chase ─────────────────────────────────────────────────────
  { bank: "JPM-Chase",   key: "JPM 2300",             last4: "x5615", accountName: "2300 Brookwood OP", propertyCode: "2300" },
  { bank: "JPM-Chase",   key: "",                     last4: "x5623", accountName: "PARENT HK Co" },
  { bank: "JPM-Chase",   key: "JPM 3610",             last4: "x5631", accountName: "PJV3 JVIII OP", propertyCode: "3610" },
  { bank: "JPM-Chase",   key: "JPM 7010",             last4: "x5656", accountName: "7010 Pkwood SC OP", propertyCode: "7010" },
  { bank: "JPM-Chase",   key: "JPM 2010 Operating",   last4: "x9629", accountName: "2010 LIK Mgmt OP", propertyCode: "2010" },
  { bank: "JPM-Chase",   key: "JPM 2000 CLEAR",       last4: "x1622", accountName: "2000 LIK CLEARING", propertyCode: "2010" },
  { bank: "JPM-Chase",   key: "JPM 2010 Escrow",      last4: "x2190", accountName: "PNIPLX NI LLC OP", propertyCode: "4000" },
  { bank: "JPM-Chase",   key: "JPM 9500",             last4: "x6088", accountName: "9500 LH LLC", propertyCode: "9510" },
  { bank: "JPM-Chase",   key: "JPM HK Castor PO (5600)", last4: "x0669", accountName: "5600 Castor Ave OP", propertyCode: "5600" },
  { bank: "JPM-Chase",   key: "JPM 7200",             last4: "x1692", accountName: "7200 Elbridge OP", propertyCode: "7200" },
  { bank: "JPM-Chase",   key: "JPM 8200",             last4: "x0308", accountName: "8200 Trust 4 OP", propertyCode: "8200" },
  { bank: "JPM-Chase",   key: "JPM 0800",             last4: "x8822", accountName: "0800 Bellmawr OP", propertyCode: "0800" },
  { bank: "JPM-Chase",   key: "JPM 1100",             last4: "x9879", accountName: "1100 Pkwood Prof Op", propertyCode: "1100" },
  { bank: "JPM-Chase",   key: "JPM 3610A",            last4: "x1993", accountName: "3610A JVIII Condo OP", propertyCode: "3610A" },
  { bank: "JPM-Chase",   key: "JPM 9510 - ACTIVE",    last4: "x1235", accountName: "9510 LH SC OP", propertyCode: "9510" },
  { bank: "JPM-Chase",   key: "KH 509 9800",          last4: "x7857", accountName: "9800 KH BELLAIRE", propertyCode: "9800" },
  { bank: "JPM-Chase",   key: "JPM 9820",             last4: "x2296", accountName: "9820 KH SPRING GARDE", propertyCode: "9820" },
  { bank: "JPM-Chase",   key: "JPM 9840",             last4: "x9579", accountName: "KH Joshua", propertyCode: "9840" },
  { bank: "JPM-Chase",   key: "JPM 9860",             last4: "x8563", accountName: "9860 KH FT WASHINGT", propertyCode: "9860" },

  // ── Liberty Bank ──────────────────────────────────────────────────
  { bank: "Liberty Bank", key: "LB 2010 SD (0250-2000)",  last4: "x7216", accountName: "SD Account - All but NILLC", propertyCode: "2010" },
  { bank: "Liberty Bank", key: "LB 4000 SD (0250-2000)",  last4: "x7448", accountName: "Nesh Interplex LLC/Korman Com Prop (NILLC-Cash 2)", propertyCode: "4000" },
  { bank: "Liberty Bank", key: "LB 7300 (0110-0000)",      last4: "x4756", accountName: "Revere Partnership", propertyCode: "7300" },
  { bank: "Liberty Bank", key: "LB 2300 (0130-0000)",      last4: "x6888", accountName: "Brookwood Shopping Center J V. (MIN)", propertyCode: "2300" },
  { bank: "Liberty Bank", key: "LB 7010 (0130-0000)",      last4: "x9436", accountName: "Parkwood Joint Venture (MIN)", propertyCode: "7010" },
  { bank: "Liberty Bank", key: "LB 4500 (0110-0000)",      last4: "x0598", accountName: "Grays Ferry Partners LP", propertyCode: "4500" },
  { bank: "Liberty Bank", key: "LB 2010 (0250-0000) MM",   last4: "x8276", accountName: "LIK Management (SD) MM", propertyCode: "2010" },
  { bank: "Liberty Bank", key: "LB 4500 (0250-0000) MM",   last4: "x8086", accountName: "Grays Ferry Partners LP  MM", propertyCode: "4500" },
  { bank: "Liberty Bank", key: "LB 7300 (0250-0000) MM",   last4: "x8177", accountName: "Revere Partnership  MM", propertyCode: "7300" },
];
