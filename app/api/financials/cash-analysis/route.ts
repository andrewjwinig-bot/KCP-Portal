import { NextResponse } from "next/server";
import { availableStatements } from "@/lib/financials/operating-statements/mappingStore";
import { listFullGls } from "@/lib/financials/operating-statements/statementStore";
import { assembleGls } from "@/lib/financials/operating-statements/glAssemble";
import { cashAtStartOfMonth } from "@/lib/financials/operating-statements/cash";
import { mortgagePaymentsFor } from "@/lib/financials/cash-sheet/mortgage";
import { anticipatedRevenueFor } from "@/lib/financials/cash-sheet/revenue";
import { bigProjectsReserveFor } from "@/lib/financials/cash-sheet/reserves";
import { getMonth } from "@/lib/financials/cash-sheet/store";
import { totalBills, monthKey, cashSheetGroups, wednesdaysInMonth } from "@/lib/financials/cash-sheet/util";
import { computeCashFlow, CASH_FLOW_BUCKETS, type CashFlowCode } from "@/lib/financials/cash-analysis/compute";
import { PROPERTY_DEFS, BANK_ACCOUNTS } from "@/lib/properties/data";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, canEditCashSheet, type UserId } from "@/lib/users";
import { cookies } from "next/headers";

/** The signed-in user from the site cookie (authoritative — not client-supplied). */
async function currentUser(): Promise<UserId | null> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? (id as UserId) : null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const GROUP_OF: Record<string, string> = {};
const addGroup = (label: string, codes: string[]) => codes.forEach((c) => (GROUP_OF[c] = label));
addGroup("Business Parks", ["PJV3", "PIIICO", "CONDO", "PNIPLX", "4900", "3610", "3620", "3640", "4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"]);
addGroup("Eastwick Joint Venture", ["1500", "9200"]);
addGroup("Shopping Centers", ["1100", "2300", "4500", "4510", "5600", "7010", "7200", "7300", "8200", "9500", "9510"]);
addGroup("LIK Management", ["2010", "2000"]);
addGroup("Korman Homes", ["9800", "9820", "9840", "9860", "PHOMES", "KORMAN HOMES"]);
// Land & Other — land parcels + GP/LP property-owner entities + Nockamixon.
addGroup("Land & Other", ["0800", "0200", "0300", "0900", "4210", "4410", "2070", "2040", "2080"]);

// Pooled funds: the buildings share ONE bank account, so the page shows ONE line
// per fund (sum of the buildings, or the consolidated fund GL if uploaded), with
// a per-building breakdown in a modal. Codes also carry the funds' rent-roll
// revenue on the buildings.
const FUND_GROUPS = [
  { fundKey: "PJV3", name: "JV III", propertyCode: "PJV3", buildings: ["3610", "3620", "3640"] },
  { fundKey: "PNIPLX", name: "NI LLC", propertyCode: "PNIPLX", buildings: ["4050", "4060", "4070", "4080", "40A0", "40B0", "40C0"] },
];
const FUND_BUILDINGS: Record<string, string[]> = Object.fromEntries(FUND_GROUPS.map((g) => [g.fundKey, g.buildings]));

function nameFor(key: string, fallback: string): string {
  return PROPERTY_DEFS.find((p) => p.id === key)?.name ?? fallback;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const emptyBuckets = (): Record<CashFlowCode, number> => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 });

// Untouched interest-bearing accounts (trust, money markets): no GL feed, so the
// balance is auto-grown from a known anchor at a fixed rate. Each month books
// (opening × rate ÷ 12) of interest as Receipts From Operations, compounding
// forward. Add more here as the same balance + rate.
type InterestAccount = {
  code: string; name: string; group: string;
  bankCodes: string[]; bankLast4?: string;
  /** Parent operating property this account sits beneath (its row sorts next to
   *  it, and the account is dropped from the parent's bank chips). Defaults to
   *  the account's own code (a standalone row, like the Trust). */
  parent?: string;
  anchor: { year: number; month: number; balance: number };
  rate: number; // annual nominal rate (e.g. 0.0315)
  monthlyFee?: number; // recurring monthly bank charge backed out of the interest
  mm?: boolean; // a money-market account — shows a green "MM" pill
};
const INTEREST_ACCOUNTS: InterestAccount[] = [
  { code: "LK-TRUST", name: "Leonard Korman Trust", group: "Business Parks", bankCodes: ["LK-TRUST"], anchor: { year: 2026, month: 6, balance: 1_845_989.33 }, rate: 0.0315, monthlyFee: 2 },
  // Property money-market accounts — sit beneath their operating row.
  { code: "2300-MM", name: "Brookwood", group: "Shopping Centers", parent: "2300", bankCodes: ["2300"], bankLast4: "x6888", anchor: { year: 2026, month: 5, balance: 1_245_207.10 }, rate: 0.0315, mm: true },
  { code: "4500-MM", name: "Gray's Ferry", group: "Shopping Centers", parent: "4500", bankCodes: ["4500"], bankLast4: "x8086", anchor: { year: 2026, month: 6, balance: 839_877.68 }, rate: 0.03, mm: true },
  { code: "7010-MM", name: "Parkwood", group: "Shopping Centers", parent: "7010", bankCodes: ["7010"], bankLast4: "x9436", anchor: { year: 2026, month: 5, balance: 351_901.78 }, rate: 0.03, mm: true },
  { code: "7300-MM", name: "Revere", group: "Shopping Centers", parent: "7300", bankCodes: ["7300"], bankLast4: "x8177", anchor: { year: 2026, month: 6, balance: 831_254.00 }, rate: 0.03, mm: true },
  { code: "2010-MM", name: "LIK", group: "LIK Management", parent: "2010", bankCodes: ["2010"], bankLast4: "x8276", anchor: { year: 2026, month: 6, balance: 507_649.44 }, rate: 0.03, mm: true },
];
const INTEREST_CODES = new Set(INTEREST_ACCOUNTS.map((a) => a.code.toUpperCase()));
/** Opening, the month's gross interest (opening × rate ÷ 12), any recurring fee,
 *  and ending — whole dollars, compounded from the anchor net of the fee. */
function interestMonth(acct: InterestAccount, year: number, period: number): { opening: number; interest: number; fee: number; ending: number } {
  const mr = acct.rate / 12;
  const fee = acct.monthlyFee ?? 0;
  const target = year * 12 + period;
  const start = acct.anchor.year * 12 + acct.anchor.month;
  let openingRaw = acct.anchor.balance;
  for (let m = start; m < target; m++) openingRaw = openingRaw + openingRaw * mr - fee; // compound net of fee
  const opening = Math.round(openingRaw);
  const interest = Math.round(opening * mr);
  return { opening, interest, fee, ending: opening + interest - fee };
}

type Estimate = { months: number; revenue: number; bills: number; mortgage: number; estimatedCash: number | null; latestEnding: number | null };
type Row = {
  key: string; propertyCode: string; name: string; group: string;
  period: number; maxPeriod: number;
  byBucket: Record<CashFlowCode, number>; netChange: number;
  glOpening: number | null; startingCash: number | null; openingOverridden: boolean; endingCash: number | null;
  scheduledDebt: number; debtExpected: boolean; debtPosted: boolean; debtMissing: boolean;
  latestGLMonth: number; estimate: Estimate | null;
  isFund?: boolean;
  /** AvidXchange bills paid this month (from the Cash Sheet store) + the
   *  per-Wednesday breakdown, for the weekly drill-down. */
  billsMTD?: number;
  weeklyBills?: { wednesday: string; amount: number }[];
  /** Budgeted Big Projects reserve set aside (auto from budget, override-able). */
  reserves?: number;
  reservesAuto?: number;
  reservesOverridden?: boolean;
  /** A non-GL account (clearing, money market, security deposits, land, condo,
   *  trust) — flat balance from the Cash Sheet store, no bucket detail. */
  manual?: boolean;
  /** Property codes whose bank accounts this row should surface (chips). */
  bankCodes?: string[];
  /** When set, only the account with this last4 is shown for the row. */
  bankLast4?: string;
  /** Account last4s to hide from this row's chips (split out to their own row). */
  excludeLast4?: string[];
  /** Auto-computed balance (e.g. interest-accruing trust) — shown formatted and
   *  not hand-editable. */
  readOnly?: boolean;
  /** Money-market account — shows a green "MM" pill. */
  mm?: boolean;
  /** For interest-bearing accounts: the month's interest calc, for the modal. */
  interest?: { opening: number; rate: number; amount: number; fee: number };
  breakdown?: { key: string; name: string; startingCash: number | null; netChange: number; endingCash: number | null; byBucket: Record<CashFlowCode, number> }[];
};

// GET ?year=&period=&ytd= — GL-bucketed cash flow per bank account (JV III / NI
// LLC buildings collapsed to one fund line), with an editable opening-cash
// override (shared with the Cash Sheet) and an Estimated-Cash-Today overlay.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const period = Math.min(12, Math.max(1, Number(url.searchParams.get("period")) || 12));
  const ytd = url.searchParams.get("ytd") === "1";
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const user = await currentUser();
  const canEdit = !!user && canEditCashSheet(user); // admin/Drew edit; others view-only

  const [mappings, fulls, scheduledDebt, overrideDoc, reserveData] = await Promise.all([
    availableStatements(),
    listFullGls(),
    mortgagePaymentsFor(year, period),
    getMonth(monthKey(year, period)), // opening-cash + reserves overrides (shared w/ Cash Sheet)
    bigProjectsReserveFor(year, period), // budgeted Big Projects reserve per property
  ]);
  const overrideFor = (code: string): number | null =>
    ytd ? null : (overrideDoc?.rows?.[code]?.startingOverride ?? null);

  // Pass 1: assemble each property's GL for the year.
  type Entry = { m: typeof mappings[number]; stored: NonNullable<ReturnType<typeof assembleGls>> };
  const entries: Entry[] = [];
  for (const m of mappings) {
    const stored = assembleGls(fulls.filter((g) => g.key === m.key && g.year === year));
    if (stored) entries.push({ m, stored });
  }

  // Weekly-overlay inputs for the un-posted months (current year only).
  const estimateApplies = year === curYear;
  const coverageEndOf = (s: typeof entries[number]["stored"]) => s.coverageEnd ?? s.maxPeriodInFile;
  const minLatest = entries.length ? Math.min(...entries.map((e) => coverageEndOf(e.stored))) : 12;
  // The snapshot's consensus month is driven by actual ACTIVITY (the close
  // month), not the report-range end — so one GL run with a wider To-date can't
  // drag the snapshot forward and mark everyone else behind. Per-property
  // "behind" still uses the report range (coverageEnd) below.
  const latestPostedPeriod = entries.length ? Math.max(...entries.map((e) => e.stored.maxPeriodInFile)) : 0;
  const gapMonths: number[] = [];
  if (estimateApplies) for (let mo = minLatest + 1; mo <= curMonth; mo++) gapMonths.push(mo);
  const billsByMonth: Record<number, Awaited<ReturnType<typeof getMonth>>> = {};
  const mortgageByMonth: Record<number, Record<string, number>> = {};
  const revenueByMonth: Record<number, Record<string, number>> = {};
  await Promise.all(gapMonths.map(async (mo) => {
    const [doc, mort, rev] = await Promise.all([getMonth(monthKey(year, mo)), mortgagePaymentsFor(year, mo), anticipatedRevenueFor(year, mo)]);
    billsByMonth[mo] = doc; mortgageByMonth[mo] = mort; revenueByMonth[mo] = rev.byCode;
  }));
  const revenueForKey = (byCode: Record<string, number>, key: string, propertyCode: string): number => {
    if (FUND_BUILDINGS[key]) return FUND_BUILDINGS[key].reduce((s, b) => s + (byCode[b.toUpperCase()] ?? 0), 0);
    return byCode[key.toUpperCase()] ?? byCode[propertyCode.toUpperCase()] ?? 0;
  };

  // Pass 2: raw per-key rows (GL opening, no override yet).
  const raw: Row[] = entries.map(({ m, stored }) => {
    // "Posted through" = the report-range end (the GL's To date), so a property
    // with no activity in the latest month still counts as current.
    const maxPeriod = stored.coverageEnd ?? stored.maxPeriodInFile;
    const p = Math.min(period, maxPeriod);
    const flow = computeCashFlow(stored.monthly, p, { ytd });
    const glOpening = cashAtStartOfMonth(stored, p);
    const scheduled = scheduledDebt[m.key.toUpperCase()] ?? scheduledDebt[m.propertyCode.toUpperCase()] ?? 0;
    const latestStart = cashAtStartOfMonth(stored, maxPeriod);
    const latestEnding = latestStart == null ? null : latestStart + computeCashFlow(stored.monthly, maxPeriod).netChange;
    const myGap = gapMonths.filter((mo) => mo > maxPeriod);
    let estBills = 0;
    for (const mo of myGap) {
      estBills += totalBills(billsByMonth[mo]?.rows?.[m.key] ?? billsByMonth[mo]?.rows?.[m.propertyCode]);
    }
    // Est. Available Cash carries the latest GL ending forward and only backs out
    // the un-posted AvidXchange bills (which already include any mortgage paid via
    // AP). No anticipated rent is added — keep it conservative. Reserves are
    // netted on the page.
    const estimate: Estimate | null = latestEnding != null && myGap.length > 0
      ? { months: myGap.length, revenue: 0, bills: estBills, mortgage: 0, estimatedCash: latestEnding - estBills, latestEnding }
      : null;
    return {
      key: m.key, propertyCode: m.propertyCode, name: nameFor(m.key, m.entityName),
      group: GROUP_OF[m.key] ?? GROUP_OF[m.propertyCode] ?? "Other",
      period: p, maxPeriod, byBucket: flow.byBucket, netChange: flow.netChange,
      glOpening, startingCash: glOpening, openingOverridden: false, endingCash: glOpening == null ? null : glOpening + flow.netChange,
      scheduledDebt: scheduled, debtExpected: scheduled > 0, debtPosted: (flow.byBucket[4] ?? 0) !== 0, debtMissing: scheduled > 0 && (flow.byBucket[4] ?? 0) === 0,
      latestGLMonth: maxPeriod, estimate,
      // Condo's bank account is keyed 3610A in Property Info, not CONDO.
      bankCodes: (m.key.toUpperCase() === "CONDO" || m.propertyCode.toUpperCase() === "CONDO") ? ["3610A"] : [m.propertyCode, m.key],
    };
  });

  // Apply the opening override (and recompute ending) for one row.
  const withOverride = (r: Row, code: string): Row => {
    const ov = overrideFor(code);
    const opening = ov != null ? ov : r.glOpening;
    return { ...r, startingCash: opening, openingOverridden: ov != null, endingCash: opening == null ? null : opening + r.netChange };
  };

  const byKey = new Map(raw.map((r) => [r.key, r]));
  const fundMemberKeys = new Set(FUND_GROUPS.flatMap((g) => [g.fundKey, ...g.buildings]));

  const sumEstimate = (rs: Row[]): Estimate | null => {
    const es = rs.map((r) => r.estimate).filter((e): e is Estimate => !!e);
    if (!es.length) return null;
    return {
      months: Math.max(...es.map((e) => e.months)),
      revenue: es.reduce((s, e) => s + e.revenue, 0),
      bills: es.reduce((s, e) => s + e.bills, 0),
      mortgage: es.reduce((s, e) => s + e.mortgage, 0),
      latestEnding: es.reduce((s, e) => s + (e.latestEnding ?? 0), 0),
      estimatedCash: es.every((e) => e.estimatedCash != null) ? es.reduce((s, e) => s + (e.estimatedCash ?? 0), 0) : null,
    };
  };

  const rows: Row[] = [];
  // Non-fund rows: pass through with their own override.
  for (const r of raw) if (!fundMemberKeys.has(r.key)) rows.push(withOverride(r, r.key));

  // Fund rows: one line per fund bank account. Combine the cash-sweep shell
  // (FNIPLX/FJVIII — holds the consolidated swept cash + inter-entity) with the
  // member buildings (which hold the operating P&L + debt). Inter-entity nets
  // out across the two, so the sum is the true consolidated picture.
  for (const g of FUND_GROUPS) {
    const consolidated = byKey.get(g.fundKey);
    const buildingRows = g.buildings.map((b) => byKey.get(b)).filter((r): r is Row => !!r);
    const basis = [consolidated, ...buildingRows].filter((r): r is Row => !!r);
    if (basis.length === 0) continue;
    const byBucket = emptyBuckets();
    for (const c of CASH_FLOW_BUCKETS) byBucket[c.code] = basis.reduce((s, r) => s + (r.byBucket[c.code] ?? 0), 0);
    const netChange = basis.reduce((s, r) => s + r.netChange, 0);
    const anyOpen = basis.some((r) => r.glOpening != null);
    const glOpening = anyOpen ? basis.reduce((s, r) => s + (r.glOpening ?? 0), 0) : null;
    const ov = overrideFor(g.fundKey);
    const opening = ov != null ? ov : glOpening;
    const scheduled = scheduledDebt[g.fundKey.toUpperCase()] ?? 0;
    const maxPeriod = Math.max(...basis.map((r) => r.maxPeriod));
    const breakdown = basis.map((r) => ({
      key: r.key, name: r.name, startingCash: r.glOpening, netChange: r.netChange, endingCash: r.endingCash, byBucket: r.byBucket,
    }));
    rows.push({
      key: g.fundKey, propertyCode: g.propertyCode, name: g.name, group: "Business Parks",
      period: Math.min(period, maxPeriod), maxPeriod, byBucket, netChange,
      glOpening, startingCash: opening, openingOverridden: ov != null, endingCash: opening == null ? null : opening + netChange,
      scheduledDebt: scheduled, debtExpected: scheduled > 0, debtPosted: byBucket[4] !== 0, debtMissing: scheduled > 0 && byBucket[4] === 0,
      latestGLMonth: maxPeriod, estimate: sumEstimate(basis),
      isFund: true, breakdown: breakdown.length ? breakdown : undefined,
      bankCodes: g.buildings,
    });
  }

  // ── Non-GL / manual accounts ──────────────────────────────────────────────
  // Both pages share one goal: list EVERY bank account for every property/entity
  // and show its cash position. GL-driven rows above cover the operating
  // properties; this pass adds the rest from the Cash Sheet's canonical roster
  // (clearing, money market, security deposits, land, condo, trust) as flat
  // balances pulled from the shared Cash Sheet store (edited there), each with
  // its bank chips.
  const present = new Set<string>();
  for (const r of rows) {
    present.add(r.key.toUpperCase());
    present.add(r.propertyCode.toUpperCase());
    if (r.breakdown) for (const b of r.breakdown) present.add(b.key.toUpperCase());
  }
  for (const g of FUND_GROUPS) for (const b of g.buildings) present.add(b.toUpperCase());

  // Map the Cash Sheet's group ids onto this page's group headings.
  const CS_GROUP_OF: Record<string, string> = {
    mgmt: "LIK Management", jv3: "Business Parks", condo: "Business Parks",
    nillc: "Business Parks", bpother: "Business Parks", sc: "Shopping Centers",
    ow: "Business Parks", kh: "Korman Homes", land: "Land & Other",
  };
  for (const g of cashSheetGroups()) {
    for (const p of g.properties) {
      const uc = p.code.toUpperCase();
      if (present.has(uc)) continue;
      if (INTEREST_CODES.has(uc)) continue; // interest accounts are added in their own pass
      present.add(uc);
      const bankCodes = p.code === "CONDO" ? ["3610A"] : [p.bankCode ?? p.code];
      const rowDoc = overrideDoc?.rows?.[p.code];
      const balance = rowDoc?.endingOverride ?? rowDoc?.startingOverride ?? null;
      const hasBank = bankCodes.some((c) => (BANK_ACCOUNTS[c.toUpperCase()] ?? []).length > 0);
      if (balance == null && !hasBank) continue; // nothing to show
      rows.push({
        key: p.code, propertyCode: p.code, name: nameFor(p.code, p.name),
        group: GROUP_OF[uc] ?? CS_GROUP_OF[g.id] ?? "Other",
        period, maxPeriod: period, byBucket: emptyBuckets(), netChange: 0,
        glOpening: balance, startingCash: balance, openingOverridden: false, endingCash: balance,
        scheduledDebt: 0, debtExpected: false, debtPosted: false, debtMissing: false,
        latestGLMonth: period, estimate: null,
        manual: true, bankCodes, bankLast4: p.bankLast4,
      });
    }
  }

  // Interest-bearing accounts (trust, money markets): auto-grown balance with the
  // month's interest booked as Receipts From Operations (bucket 1), read-only.
  for (const acct of INTEREST_ACCOUNTS) {
    const uc = acct.code.toUpperCase();
    if (present.has(uc)) continue;
    present.add(uc);
    const t = interestMonth(acct, year, period);
    const b = emptyBuckets();
    b[1] = t.interest;            // gross interest → Receipts From Operations
    if (t.fee) b[2] = -t.fee;     // recurring bank charge → Operating Expenses
    rows.push({
      key: acct.code, propertyCode: acct.parent ?? acct.code, name: acct.name,
      group: acct.group, period, maxPeriod: period, byBucket: b, netChange: t.interest - t.fee,
      glOpening: t.opening, startingCash: t.opening, openingOverridden: false, endingCash: t.ending,
      scheduledDebt: 0, debtExpected: false, debtPosted: false, debtMissing: false,
      latestGLMonth: period, estimate: null,
      readOnly: true, mm: acct.mm, bankCodes: acct.bankCodes, bankLast4: acct.bankLast4,
      interest: { opening: t.opening, rate: acct.rate, amount: t.interest, fee: t.fee },
    });
    // Drop this account from the parent operating row's chips so it shows once.
    if (acct.parent && acct.bankLast4) {
      const parent = rows.find((r) => r.key === acct.parent);
      if (parent) parent.excludeLast4 = [...(parent.excludeLast4 ?? []), acct.bankLast4];
    }
  }

  // Safety net: guarantee EVERY bank account in Property Info is shown. Anything
  // not already surfaced by a row above gets its own flat account row, so no
  // account can silently fall off the page.
  const shownLast4 = new Set<string>();
  for (const r of rows) {
    for (const c of r.bankCodes ?? [r.propertyCode, r.key]) {
      for (const a of BANK_ACCOUNTS[c.toUpperCase()] ?? []) {
        if (!r.bankLast4 || a.last4 === r.bankLast4) shownLast4.add(a.last4);
      }
    }
  }
  for (const [code, accts] of Object.entries(BANK_ACCOUNTS)) {
    for (const a of accts) {
      if (shownLast4.has(a.last4)) continue;
      shownLast4.add(a.last4);
      rows.push({
        key: `${code}-${a.last4}`, propertyCode: code, name: `${nameFor(code, a.label)} · ${a.label}`,
        group: GROUP_OF[code.toUpperCase()] ?? "Other",
        period, maxPeriod: period, byBucket: emptyBuckets(), netChange: 0,
        glOpening: null, startingCash: null, openingOverridden: false, endingCash: null,
        scheduledDebt: 0, debtExpected: false, debtPosted: false, debtMissing: false,
        latestGLMonth: period, estimate: null,
        manual: true, bankCodes: [code], bankLast4: a.last4,
      });
    }
  }

  // Weekly AvidXchange bills for the selected month (per-Wednesday + total), so
  // the page can show an "Avid Bills" column with a weekly drill-down. Bills are
  // keyed by the fund code for pooled funds, otherwise the property/GL key.
  const wednesdays = wednesdaysInMonth(year, period);
  for (const r of rows) {
    if (r.manual) continue;
    const billDoc = overrideDoc?.rows?.[r.key]?.bills ?? overrideDoc?.rows?.[r.propertyCode]?.bills ?? {};
    const weeklyBills = wednesdays.map((w) => ({ wednesday: w, amount: billDoc[w] ?? 0 }));
    const billsMTD = weeklyBills.reduce((s, b) => s + b.amount, 0);
    if (billsMTD !== 0) { r.weeklyBills = weeklyBills; r.billsMTD = billsMTD; }
  }

  // Split the Security Deposits — All but NI LLC account (Liberty x7216) off the
  // 2010 LIK Management row into its own line below it. 2010 is the operating
  // account, so the Security Deposits bucket movement belongs to the dedicated
  // security-deposit account, not operating cash.
  const opRow = rows.find((r) => r.key === "2010");
  if (opRow) {
    const sd8 = opRow.byBucket[8] ?? 0;
    opRow.byBucket = { ...opRow.byBucket, 8: 0 };
    opRow.netChange -= sd8;
    if (opRow.endingCash != null) opRow.endingCash -= sd8;
    opRow.excludeLast4 = [...(opRow.excludeLast4 ?? []), "x7216"];
    const sdBuckets = emptyBuckets();
    sdBuckets[8] = sd8;
    const sdOv = overrideFor("2010-SD-ALLBUTNI");
    rows.push({
      key: "2010-SD-ALLBUTNI", propertyCode: "2010", name: "Security Deposits — All but NI LLC",
      group: opRow.group, period: opRow.period, maxPeriod: opRow.maxPeriod,
      byBucket: sdBuckets, netChange: sd8,
      glOpening: null, startingCash: sdOv, openingOverridden: sdOv != null,
      endingCash: sdOv != null ? sdOv + sd8 : null,
      scheduledDebt: 0, debtExpected: false, debtPosted: false, debtMissing: false,
      latestGLMonth: opRow.latestGLMonth, estimate: null,
      bankCodes: ["2010"], bankLast4: "x7216",
    });
  }

  // Budgeted Big Projects reserve per row (override → budget auto). Funds sum
  // their buildings' reserves; manual/non-GL accounts default to none.
  for (const r of rows) {
    const autoRes = r.isFund
      ? (FUND_BUILDINGS[r.key] ?? []).reduce((s, b) => s + (reserveData.byCode[b.toUpperCase()] ?? 0), 0)
      : (reserveData.byCode[r.key.toUpperCase()] ?? reserveData.byCode[r.propertyCode.toUpperCase()] ?? 0);
    const ov = overrideDoc?.rows?.[r.key]?.reserves;
    r.reservesAuto = autoRes;
    r.reserves = ov != null ? ov : autoRes;
    r.reservesOverridden = ov != null;
  }

  // Most recent GL import for this year (drives the "Last imported" line).
  const yearGls = fulls.filter((g) => g.year === year);
  const latestGl = yearGls.length ? yearGls.reduce((a, b) => (a.uploadedAt >= b.uploadedAt ? a : b)) : null;

  // Display the fund account code (where the GL detail is held) on the fund rows
  // instead of the internal P-code: FJVIII / FNIPLX / FIIICO.
  const FUND_DISPLAY_CODE: Record<string, string> = {
    PJV3: "FJVIII", FJVIII: "FJVIII",
    PNIPLX: "FNIPLX", FNIPLX: "FNIPLX",
    CONDO: "FIIICO", PIIICO: "FIIICO",
  };
  for (const r of rows) {
    const d = FUND_DISPLAY_CODE[r.key.toUpperCase()] ?? FUND_DISPLAY_CODE[r.propertyCode.toUpperCase()];
    if (d) r.propertyCode = d;
  }

  return NextResponse.json({
    year, period, ytd,
    buckets: CASH_FLOW_BUCKETS,
    rows,
    canEdit,
    canEditOpening: !ytd && canEdit,
    ym: monthKey(year, period),
    estimateAsOf: estimateApplies && gapMonths.length ? `${MONTHS[curMonth - 1]} ${curYear}` : null,
    gapMonthLabels: gapMonths.map((mo) => MONTHS[mo - 1]),
    latestPostedPeriod,
    lastImport: latestGl ? { at: latestGl.uploadedAt, by: latestGl.uploadedBy ?? null } : null,
    apImport: overrideDoc?.apImportedAt ? { at: overrideDoc.apImportedAt, by: overrideDoc.apImportedBy ?? null } : null,
    generatedAt: new Date().toISOString(),
  });
}
