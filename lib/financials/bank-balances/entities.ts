// Which line of the bank-balance view each bank account lands on. The account
// list is the Bank Rec Tracker's (`UNIQUE_BANK_ACCOUNTS`) — ONE registry of the
// accounts we hold — plus the few accounts that tracker does not reconcile.
// Pooled funds read as ONE line (JV III and NI LLC each bank through one
// account), and the tenant security-deposit accounts are their own RESTRICTED
// group: tenants' money, carried in the balance and never in net available.
// Client-safe (no storage).

import { UNIQUE_BANK_ACCOUNTS, type BankGroup, type UniqueBankAccount } from "@/lib/bank-rec/accounts";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { FUND_BUILDINGS } from "@/lib/financials/cash-analysis/funds";

/** Accounts on the bank exports that the Bank Rec Tracker does not list. */
export const EXTRA_ACCOUNTS: UniqueBankAccount[] = [
  { bank: "M&T", key: "M&T 150 920", last4: "x4031", accountName: "Eastwick JV I and XII", propertyCode: "1500/9200" },
];

export const BALANCE_ACCOUNTS: UniqueBankAccount[] = [...UNIQUE_BANK_ACCOUNTS, ...EXTRA_ACCOUNTS];

export const BALANCE_GROUPS = [
  "Management", "Business Parks", "Shopping Centers", "Korman Homes", "Land & Other", "Tenant Security Deposits",
] as const;
export type BalanceGroup = typeof BALANCE_GROUPS[number];

export type BalanceEntity = {
  /** The row key — also the Cash Sheet's reserve key (PJV3 / PNIPLX for a fund). */
  key: string;
  name: string;
  group: BalanceGroup;
  /** Tenants' money: the whole balance is held back. */
  restricted?: boolean;
  /** Property codes whose budgeted Big Projects reserve this line carries. */
  reserveCodes: string[];
};

const SD_NAME: Record<string, string> = {
  x7216: "Security Deposits — All but NI LLC",
  x7448: "Security Deposits — NI LLC",
  // Liberty's LIK Management (SD) money market (x8276) is security deposits,
  // not LIK's cash — it reads on the All but NI LLC line (SD_LINE, owner).
};

/** Accounts with no property code in the registry, or that are not their property's operating account. */
const UNCODED: Record<string, BalanceEntity> = {
  x5623: { key: "HKCO", name: "Hyman Korman Co (Parent)", group: "Land & Other", reserveCodes: [] },
  x6063: { key: "TKD", name: "TKD-Neshaminy LLC", group: "Land & Other", reserveCodes: [] },
  // The clearing account is pass-through, not LIK's own cash — its own line,
  // keyed to sort just under LIK Management (owner).
  x1622: { key: "2010-CLR", name: "LIK Clearing", group: "Management", reserveCodes: [] },
  // 9500 LH LLC (x6088) is registered under 9510 and reads on 9510's line (owner).
};

function groupOf(code: string): BalanceGroup {
  if (code === "2010") return "Management";
  // Office Works and Interstate (Bellmawr) bank as business-park entities.
  if (code === "4900" || code === "0800") return "Business Parks";
  const def = PROPERTY_DEFS.find((p) => p.id === code);
  if (def?.type === "Retail") return "Shopping Centers";
  if (def?.type === "Office") return "Business Parks";
  if (def?.type === "Residential") return "Korman Homes";
  return "Land & Other";
}

/** Accounts that read as ONE line with another (owner): each maps to the
 *  line key it joins. */
const SD_LINE: Record<string, string> = { x8276: "x7216" };

export function entityFor(a: UniqueBankAccount): BalanceEntity {
  // The LIK money market holds the same deposits as "All but NI LLC" — one line (owner).
  const sd = SD_LINE[a.last4] ?? a.last4;
  if (SD_NAME[sd]) return { key: `SD-${sd}`, name: SD_NAME[sd], group: "Tenant Security Deposits", restricted: true, reserveCodes: [] };
  if (UNCODED[a.last4]) return UNCODED[a.last4];
  // KF Nockamixon / LKF Nock (x6127) banks with Kosano (2070) as one line (owner).
  const code = a.last4 === "x6127" ? "2070" : a.propertyCode ?? "";
  if (code === "2070") return { key: "2070", name: "Kosano Associates LP (Nockamixon)", group: groupOf("2070"), reserveCodes: ["2070"] };
  if (a.last4 === "x5631") return { key: "PJV3", name: "JV III", group: "Business Parks", reserveCodes: FUND_BUILDINGS.PJV3 };
  if (code === "4000") return { key: "PNIPLX", name: "NI LLC", group: "Business Parks", reserveCodes: FUND_BUILDINGS.PNIPLX };
  if (code === "3610A") return { key: "3610A", name: "JV III Condo", group: "Business Parks", reserveCodes: [] };
  if (code === "1500/9200") return { key: "EASTWICK", name: "Eastwick Joint Venture", group: "Land & Other", reserveCodes: ["1500", "9200"] };
  if (code === "2010") return { key: "2010", name: "LIK Management", group: "Management", reserveCodes: ["2010"] };
  const def = PROPERTY_DEFS.find((p) => p.id === code);
  return { key: code || a.last4, name: def?.name ?? a.accountName, group: groupOf(code), reserveCodes: code ? [code] : [] };
}

export const accountId = (bank: BankGroup | string, last4: string) => `${bank}|${last4}`;
