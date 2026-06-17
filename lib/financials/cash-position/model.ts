// Weekly Cash Position — the "available cash" snapshot, modeled on the legacy
// month-end "CASH REPORT" but refreshed weekly. Per entity, cash is split into
// buckets that net to Available Cash:
//
//   Operating Cash + A/P + RE-Tax Escrow + Insurance Escrow
//     + Self-Reserve Capital + Self Reserves & Other + Bank TI Reserves
//     + Money Market = Net Available Cash
//
// Deductions (A/P, escrows, reserves) are held as NEGATIVE numbers and money
// market / operating as positive — so Net Available is simply the sum, matching
// how the spreadsheet has always been kept. Pure (no server-only deps) so the
// page can import it.

export const CASH_POSITION_BUCKETS = [
  { key: "operatingCash", label: "Operating Cash", deduction: false },
  { key: "ap",            label: "A/P",            deduction: true },
  { key: "retEscrow",     label: "RE-Tax Escrow",  deduction: true },
  { key: "insEscrow",     label: "Insurance Escrow", deduction: true },
  { key: "reserveCapital",label: "Self-Reserve Capital", deduction: true },
  { key: "reserveOther",  label: "Self Reserves & Other", deduction: true },
  { key: "bankTI",        label: "Bank TI Reserves", deduction: false },
  { key: "moneyMarket",   label: "Money Market", deduction: false },
] as const;

export type CashPositionBucket = (typeof CASH_POSITION_BUCKETS)[number]["key"];

export type CashPositionRow = {
  /** Stable storage key for the entity/account (unique across the report). */
  code: string;
  /** Display name. */
  name: string;
  /** Bank account to deep-link, referenced by code + last4 (see BANK_ACCOUNTS). */
  bankCode?: string;
  bankLast4?: string;
};

export type CashPositionGroup = { id: string; label: string; rows: CashPositionRow[] };

// Entity layout mirrors the legacy CASH REPORT exactly (the authoritative sheet
// the team has been keeping). Codes are the storage keys; where an account has
// no clean numeric GL code we assign a stable slug.
export const CASH_POSITION_GROUPS: CashPositionGroup[] = [
  { id: "bp", label: "Business Parks", rows: [
    { code: "0800",     name: "Interstate Business Park", bankCode: "0800", bankLast4: "x8822" },
    { code: "PJV3",     name: "Lincoln JV III",           bankCode: "3610", bankLast4: "x5631" },
    { code: "CONDO",    name: "Neshaminy III Condo Assoc", bankCode: "3610A", bankLast4: "x1993" },
    { code: "PNIPLX",   name: "Neshaminy Interplex LLC",  bankCode: "4000", bankLast4: "x2190" },
    { code: "NILLC-TSD",name: "NI LLC – Tenant Security Deposits", bankCode: "4000", bankLast4: "x7448" },
    { code: "LK-TRUST", name: "Leonard Korman Trust" },
    { code: "4900",     name: "The Office Works",         bankCode: "4900", bankLast4: "x3777" },
  ] },
  { id: "eastwick", label: "Eastwick Joint Venture", rows: [
    { code: "1500", name: "Eastwick JV I",  bankCode: "1500/9200", bankLast4: "x4031" },
    { code: "9200", name: "Eastwick JV XII" },
  ] },
  { id: "sc", label: "Shopping Centers", rows: [
    { code: "1100", name: "Parkwood Professional Building", bankCode: "1100", bankLast4: "x9879" },
    { code: "2300", name: "Brookwood Shopping Center",      bankCode: "2300", bankLast4: "x5615" },
    { code: "4500", name: "Grays Ferry Partners L.P.",      bankCode: "4500", bankLast4: "x0598" },
    { code: "4510", name: "Grays Ferry Shopping Assoc" },
    { code: "5600", name: "Hyman Korman Co",                bankCode: "5600", bankLast4: "x0669" },
    { code: "7010", name: "Parkwood Joint Venture",         bankCode: "7010", bankLast4: "x5656" },
    { code: "7200", name: "Elbridge Shopping Center",       bankCode: "7200", bankLast4: "x1692" },
    { code: "7300", name: "Revere Shopping Center",         bankCode: "7300", bankLast4: "x4756" },
    { code: "8200", name: "Trust # 4",                      bankCode: "8200", bankLast4: "x0308" },
    { code: "9500", name: "Lafayette Hill LLC",             bankCode: "9510", bankLast4: "x6088" },
    { code: "9510", name: "Shops at Lafayette Hill",        bankCode: "9510", bankLast4: "x1235" },
  ] },
  { id: "lik", label: "LIK Management", rows: [
    { code: "2000",     name: "LIK Management – Clearing", bankCode: "2010", bankLast4: "x1622" },
    { code: "2010",     name: "LIK Management, Inc.",      bankCode: "2010", bankLast4: "x9629" },
    { code: "LIK-TSD",  name: "LIK Management – Tenant Security Deposits", bankCode: "2010", bankLast4: "x7216" },
    { code: "LIK-ESC",  name: "LIK Management – Escrow" },
  ] },
  { id: "gplp", label: "GP / LP – Property Owner", rows: [
    { code: "0200", name: "TKD – Neshaminy, LLC" },
    { code: "0300", name: "Airport Interplex Two, Inc." },
    { code: "0900", name: "Lincoln JV I" },
    { code: "4210", name: "Building Six Associates" },
    { code: "4410", name: "Neshaminy Eight, GP LP" },
  ] },
  { id: "nock", label: "Nockamixon", rows: [
    { code: "2070", name: "Kosano Associates LP", bankCode: "2070", bankLast4: "x6119" },
    { code: "2040", name: "KF Nockamixon LLC" },
    { code: "2080", name: "LKF Nock LP" },
  ] },
  { id: "kh", label: "Korman Homes", rows: [
    { code: "9800", name: "KH 509 LLC",            bankCode: "9800", bankLast4: "x7857" },
    { code: "9820", name: "KH – Spring Garden St", bankCode: "9820", bankLast4: "x2296" },
    { code: "9840", name: "KH Joshua 3044 LLC",    bankCode: "9840", bankLast4: "x9579" },
  ] },
];

/** Per-entity saved values for one week. Bucket values are signed (deductions
 *  negative); missing buckets are 0. */
export type CashPositionEntry = {
  values: Partial<Record<CashPositionBucket, number>>;
  note?: string;
};

/** Net Available Cash for one entity = sum of all bucket values (signed). */
export function netAvailable(entry: CashPositionEntry | undefined): number {
  if (!entry) return 0;
  let sum = 0;
  for (const b of CASH_POSITION_BUCKETS) sum += entry.values[b.key] ?? 0;
  return sum;
}

/** All entity codes on the report (flat). */
export function cashPositionCodes(): string[] {
  return CASH_POSITION_GROUPS.flatMap((g) => g.rows.map((r) => r.code));
}

// ── Weekly keys (Friday week-ending) ─────────────────────────────────────────
// A cash position is taken as of a week-ending Friday. Helpers keep the page +
// store agreed on the key format ("YYYY-MM-DD").

function pad(n: number): string { return String(n).padStart(2, "0"); }
function iso(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/** The Friday on or before `d` (the week-ending date for that week). */
export function weekEndingFriday(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0 Sun … 6 Sat
  const back = (day - 5 + 7) % 7; // days since the most recent Friday
  x.setDate(x.getDate() - back);
  return iso(x);
}

/** Shift a week-ending ISO date by ±N weeks. */
export function shiftWeek(weekIso: string, weeks: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekIso);
  if (!m) return weekIso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + weeks * 7);
  return iso(d);
}
