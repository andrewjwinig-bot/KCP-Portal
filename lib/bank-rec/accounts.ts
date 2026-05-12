// Master list of unique bank accounts as tracked in the Bank Rec spreadsheet.
// Source of truth for the Bank Rec Tracker. Keep in spreadsheet order within
// each bank group so the on-screen order mirrors what Stacie sees in Excel.

export type BankGroup = "M&T" | "JPM-Chase" | "Liberty Bank";

export interface UniqueBankAccount {
  bank: BankGroup;
  /** "Bank Account Key" column — internal nickname, e.g. "M&T 4900", "JPM 3610". */
  key: string;
  /** Trailing-digits label, e.g. "x3777". */
  last4: string;
  /** Display name from the "Account Name" column. */
  accountName: string;
}

export const UNIQUE_BANK_ACCOUNTS: UniqueBankAccount[] = [
  // ── M&T ───────────────────────────────────────────────────────────
  { bank: "M&T",         key: "M&T 4900",        last4: "x3777", accountName: "Office Works Partnership" },
  { bank: "M&T",         key: "M&T 150 920",     last4: "x4031", accountName: "Eastwick Joint Venture" },
  { bank: "M&T",         key: "M&T 2070",        last4: "x6119", accountName: "Kosano Associates LP" },
  { bank: "M&T",         key: "M&T 204 208",     last4: "x6127", accountName: "KF Nockamixon LLC" },
  { bank: "M&T",         key: "M&T 2000 Clear",  last4: "x6055", accountName: "LIK Management Inc" },
  { bank: "M&T",         key: "M&T 2-3-9-42-44", last4: "x6063", accountName: "TKD-Neshaminy LLC" },

  // ── JPM-Chase ─────────────────────────────────────────────────────
  { bank: "JPM-Chase",   key: "KH 509 9800",          last4: "x7857", accountName: "KH 509 LLC" },
  { bank: "JPM-Chase",   key: "JPM 3610",             last4: "x5631", accountName: "Lincoln Sub Jnt Vent III LIK Mgmt DBA KCP" },
  { bank: "JPM-Chase",   key: "JPM 2300",             last4: "x5615", accountName: "Brookwood Shopping Center JV" },
  { bank: "JPM-Chase",   key: "JPM 7010",             last4: "x5656", accountName: "Parkwood JV LIK MGmt DBA KCP Escr" },
  { bank: "JPM-Chase",   key: "JPM 2010 Escrow",      last4: "x2190", accountName: "LIK Management Inc dba KCP" },
  { bank: "JPM-Chase",   key: "JPM 2000 CLEAR",       last4: "x1622", accountName: "LIK Management, Inc. DBA KCP, Inc." },
  { bank: "JPM-Chase",   key: "JPM 2010 Operating",   last4: "x9629", accountName: "LIK Management Inc dba KCP" },
  { bank: "JPM-Chase",   key: "JPM HK Castor PO (5600)", last4: "x0669", accountName: "Hyman Korman Co - NEW" },
  { bank: "JPM-Chase",   key: "JPM 8200",             last4: "x0308", accountName: "1942 Trust - LIK Mgmt Escrow" },
  { bank: "JPM-Chase",   key: "JPM 7200",             last4: "x1692", accountName: "Elbridge Partnership - LIK Mgmt Escrow" },
  { bank: "JPM-Chase",   key: "JPM 1100",             last4: "x9879", accountName: "The Korman Co. 1100 & 5300" },
  { bank: "JPM-Chase",   key: "JPM 0800",             last4: "x8822", accountName: "Bellmawr Joint Venture" },
  { bank: "JPM-Chase",   key: "JPM 3610A",            last4: "x1993", accountName: "Neshaminy III Condominium Assoc" },
  { bank: "JPM-Chase",   key: "JPM 9510 - ACTIVE",    last4: "x1235", accountName: "New: Lafayette Hill / LIK Mgmt" },
  { bank: "JPM-Chase",   key: "JPM 9500",             last4: "x6088", accountName: "LIK Mgmt Inc DBA KCP (Lafayette Hill SC LLC)" },
  { bank: "JPM-Chase",   key: "JPM 9820",             last4: "x2296", accountName: "KH-Spring Garden Street LLC" },
  { bank: "JPM-Chase",   key: "JPM 9840",             last4: "x9579", accountName: "KH-Joshua" },
  { bank: "JPM-Chase",   key: "JPM 9860",             last4: "x8563", accountName: "Korman Homes LLC" },

  // ── Liberty Bank ──────────────────────────────────────────────────
  { bank: "Liberty Bank", key: "LB 2010 SD (0250-2000)",  last4: "x7216", accountName: "LIK Management Inc (LIK-Cash 3)" },
  { bank: "Liberty Bank", key: "LB 4000 SD (0250-2000)",  last4: "x7448", accountName: "Nesh Interplex LLC/Korman Com Prop (NILLC-Cash 2)" },
  { bank: "Liberty Bank", key: "LB 7300 (0110-0000)",      last4: "x4756", accountName: "Revere Partnership" },
  { bank: "Liberty Bank", key: "LB 2300 (0130-0000)",      last4: "x6888", accountName: "Brookwood Shopping Center J V. (MIN)" },
  { bank: "Liberty Bank", key: "LB 7010 (0130-0000)",      last4: "x9436", accountName: "Parkwood Joint Venture (MIN)" },
  { bank: "Liberty Bank", key: "LB 4500 (0110-0000)",      last4: "x0598", accountName: "Grays Ferry Partners LP" },
  { bank: "Liberty Bank", key: "LB 2010 (0250-0000) MM",   last4: "x8276", accountName: "LIK Management (SD) MM" },
  { bank: "Liberty Bank", key: "LB 4500 (0250-0000) MM",   last4: "x8086", accountName: "Grays Ferry Partners LP  MM" },
  { bank: "Liberty Bank", key: "LB 7300 (0250-0000) MM",   last4: "x8177", accountName: "Revere Partnership  MM" },
];
