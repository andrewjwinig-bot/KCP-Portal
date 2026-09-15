// Which balance-sheet section a GL account belongs to.
//
// The portal already ingests every account in the Skyline ledger — the GL
// importer captures a Beginning Balance, twelve monthly nets and a YTD Total
// PER ACCOUNT, with no P&L filtering. What it has never had is any notion of
// what an account IS: cash, a receivable, a mortgage, partners' capital. Every
// balance-sheet account has been landing in the operating statement's
// "unmapped accounts" leftovers list. This file is that missing classification.
//
// PRECEDENCE, deliberately in this order:
//   1. an explicit per-account override (staff corrected it on screen)
//   2. the account-number RANGE map below
//   3. a keyword rule on the GL's own account name, for accounts no range covers
//   4. unclassified — surfaced on the page, NEVER silently dropped
//
// Ranges beat names because the range map is structural: within one chart of
// accounts an account number means one thing, whereas a name like
// "Security Deposits" appears on BOTH the restricted-cash asset (0250) and the
// liability owed back to the tenant (2130). Reading the name first would put
// one of them in the wrong half of the sheet.
//
// The ranges are reconstructed from three artifacts that describe the SAME
// chart of accounts: the ~420-account cash-flow bucket map extracted from the
// legacy Cash Analysis workbook (lib/financials/cash-analysis/accountCodes.ts),
// the per-property statement line masks (data/operating-statements/
// line-mappings.json), and the account names the GL parser captures. They are
// an inference, not a published chart of accounts — which is exactly why an
// account that lands in the wrong place is correctable per property, and why
// the balance proof (see compute.ts) is shown rather than assumed.

export type BsSection = "asset" | "liability" | "equity";

export interface BsGroupDef {
  /** Stable key, used by the override store and the export. */
  key: string;
  section: BsSection;
  label: string;
  /** Sort order within its section. */
  order: number;
  /** A deduction shown inside its section (accumulated depreciation), which
   *  carries a credit balance while sitting under Assets. */
  contra?: boolean;
}

export const BS_GROUPS: BsGroupDef[] = [
  // ── Assets ────────────────────────────────────────────────────────────────
  { key: "cash",        section: "asset", order: 10, label: "Cash and cash equivalents" },
  { key: "restricted",  section: "asset", order: 20, label: "Restricted cash — tenant security deposits" },
  { key: "escrow",      section: "asset", order: 30, label: "Escrow deposits held by lender" },
  { key: "receivables", section: "asset", order: 40, label: "Tenant and other receivables" },
  { key: "prepaid",     section: "asset", order: 50, label: "Prepaid expenses and other assets" },
  { key: "dueFrom",     section: "asset", order: 60, label: "Due from affiliates" },
  { key: "realEstate",  section: "asset", order: 70, label: "Real estate and improvements, at cost" },
  { key: "deferred",    section: "asset", order: 80, label: "Deferred charges" },
  { key: "accumDep",    section: "asset", order: 90, label: "Less: accumulated depreciation and amortization", contra: true },
  // ── Liabilities ───────────────────────────────────────────────────────────
  { key: "payables",    section: "liability", order: 10, label: "Accounts payable and accrued expenses" },
  { key: "sdPayable",   section: "liability", order: 20, label: "Tenant security deposits payable" },
  { key: "dueTo",       section: "liability", order: 30, label: "Due to affiliates" },
  { key: "mortgage",    section: "liability", order: 40, label: "Mortgage payable" },
  // ── Partners' capital ─────────────────────────────────────────────────────
  { key: "capital",     section: "equity", order: 10, label: "Partners' capital" },
];

const GROUP_BY_KEY = new Map(BS_GROUPS.map((g) => [g.key, g]));
export function bsGroup(key: string): BsGroupDef | undefined { return GROUP_BY_KEY.get(key); }

/** A GL account code is "MMMM-SSSS": a four-digit major and a four-digit sub. */
export function splitAccount(code: string): { major: number; sub: string } | null {
  const m = /^(\d{4})-(\d{4})$/.exec((code ?? "").trim());
  if (!m) return null;
  return { major: Number(m[1]), sub: m[2] };
}

/** Major-number ranges, inclusive. First match wins, so put the exceptions
 *  that sit INSIDE a wider range ahead of it. */
const RANGES: { lo: number; hi: number; group: string }[] = [
  // Cash. 0110 is Cash-Operating; 0130-xxxx are the money-market and reserve
  // accounts. 0250-xxxx is also cash, but it is the tenants' money sitting in
  // the two pooled Liberty security-deposit accounts, so it is shown restricted
  // rather than as spendable operating cash — with its liability at 2130.
  { lo: 110,  hi: 139,  group: "cash" },
  { lo: 250,  hi: 259,  group: "restricted" },
  // Receivables. Their movement is bucketed as "Receipts From Operations" in
  // the cash analysis, which is what identifies them: a change in a receivable
  // is a receipt.
  { lo: 410,  hi: 459,  group: "receivables" },
  // Inter-entity, tagged "Other Assets / Inter-Entity" in the bucket map.
  { lo: 430,  hi: 439,  group: "dueFrom" },
  { lo: 460,  hi: 559,  group: "prepaid" },
  // Building capital in progress, ahead of the completed asset ranges.
  { lo: 560,  hi: 799,  group: "realEstate" },
  { lo: 1410, hi: 1499, group: "realEstate" },
  // Accumulated depreciation sits between the cost ranges, so it is listed
  // between them and matched first by being the narrower range.
  { lo: 1510, hi: 1599, group: "accumDep" },
  { lo: 1610, hi: 1699, group: "realEstate" },
  { lo: 1740, hi: 1769, group: "accumDep" },
  { lo: 1810, hi: 1849, group: "realEstate" },
  // Lender escrows — real estate taxes and insurance held by the servicer.
  // Material from 10/2026, when the Liberty reset starts collecting $93,552 a
  // month across the five loans.
  { lo: 1860, hi: 1899, group: "escrow" },
  { lo: 1950, hi: 1989, group: "realEstate" },
  { lo: 1990, hi: 1999, group: "dueFrom" },
  { lo: 2110, hi: 2129, group: "payables" },
  { lo: 2130, hi: 2139, group: "sdPayable" },
  { lo: 2140, hi: 2499, group: "payables" },
  { lo: 2500, hi: 2599, group: "mortgage" },
  { lo: 2700, hi: 2749, group: "mortgage" },
  { lo: 2750, hi: 2759, group: "dueTo" },
  { lo: 2760, hi: 2799, group: "mortgage" },
  // 2970 is an escrow ASSET despite sitting in the liability range — it is
  // tagged "Change in Escrows" in the bucket map alongside 1860/1890.
  { lo: 2970, hi: 2979, group: "escrow" },
  { lo: 3200, hi: 3799, group: "capital" },
];

/** 1940-0000 is accumulated amortization of lease costs; 1940-8501 is the
 *  capitalized cost itself. Same major, opposite sides — so the sub decides. */
function nineteenForty(sub: string): string { return sub === "0000" ? "accumDep" : "deferred"; }

/**
 * Keyword rules on the GL's own account NAME. These run only for accounts no
 * range covers, so they can never override the structural map — they exist so
 * a chart-of-accounts addition lands somewhere sensible instead of in the
 * unclassified pile. Ordered most specific first.
 */
const NAME_RULES: { re: RegExp; group: string }[] = [
  { re: /accum(ulated)?\s*(depreciation|amortization|deprec)/i, group: "accumDep" },
  { re: /security\s*deposits?\s*(payable|liability|due)/i,      group: "sdPayable" },
  { re: /escrow/i,                                              group: "escrow" },
  { re: /mortgage|note\s*payable|loan\s*payable/i,              group: "mortgage" },
  { re: /due\s*to\b|payable\s*to\s*affiliate/i,                 group: "dueTo" },
  { re: /due\s*from\b|receivable\s*from\s*affiliate/i,          group: "dueFrom" },
  { re: /accounts?\s*payable|accrued/i,                         group: "payables" },
  { re: /partners?'?\s*(capital|equity)|distribution|contribution|draw/i, group: "capital" },
  { re: /prepaid/i,                                             group: "prepaid" },
  { re: /receivable/i,                                          group: "receivables" },
  { re: /money\s*market|^cash\b|\bcash\b/i,                     group: "cash" },
  { re: /land|building|improvement|equipment|tenant\s*improvement/i, group: "realEstate" },
];

/** True for the revenue and expense accounts — 4190 up. They are NOT on the
 *  balance sheet; their net for the period is the "Net income (loss)" line
 *  inside partners' capital, which is what makes the sheet balance. */
export function isProfitAndLoss(code: string): boolean {
  const s = splitAccount(code);
  return !!s && s.major >= 4000;
}

/** True for a balance-sheet account: everything below the revenue accounts. */
export function isBalanceSheetAccount(code: string): boolean {
  const s = splitAccount(code);
  return !!s && s.major < 4000;
}

/**
 * The group an account belongs to, or null when nothing recognises it (the
 * caller shows it rather than dropping it). `overrides` is the per-property
 * correction map: account code → group key, or "" to force it out of the sheet.
 */
export function classifyAccount(
  code: string,
  name?: string,
  overrides?: Record<string, string>,
): BsGroupDef | null {
  const ov = overrides?.[code];
  if (ov != null) return ov === "" ? null : (GROUP_BY_KEY.get(ov) ?? null);

  const s = splitAccount(code);
  if (!s) return null;
  if (s.major >= 4000) return null; // P&L — handled as net income, not a group

  if (s.major === 1940) return GROUP_BY_KEY.get(nineteenForty(s.sub)) ?? null;

  for (const r of RANGES) {
    if (s.major >= r.lo && s.major <= r.hi) return GROUP_BY_KEY.get(r.group) ?? null;
  }
  if (name) {
    for (const rule of NAME_RULES) {
      if (rule.re.test(name)) return GROUP_BY_KEY.get(rule.group) ?? null;
    }
  }
  return null;
}
