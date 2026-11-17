// Quarterly workpapers — the balance sheet, PROVEN account by account.
//
// The year-end workpapers the accountants build (e.g. "4500 Grays Ferry
// Partners LP Workpaper 12.2025_Tax.xlsx") are one support schedule per
// balance-sheet account: the opening balance, every entry in the year, a
// total, "Per Trial Balance", "Difference", TRUE. Cash is proven by the bank
// rec, receivables by the tenant aging, payables by the vendor aging, the
// mortgage by the lender's amortization, capital by each partner's
// contributions. A balance that cannot be proven means something upstream is
// wrong — income missed, a bill double-booked, a deposit never recorded — and
// at year end those get parked in Suspense to make cash tie.
//
// Built by hand once a year, problems surface 3–12 months late. Built here,
// from the GL the portal already holds, every quarter: each account's schedule
// is the GL itself, so it always ties unless the GL is incomplete — and the
// value is the FLAGS, which are the balance sheet's "flags to investigate".
//
// Pure: the route feeds it the GL, the transactions and the independent
// sources (debt schedule, deposits register, bank rec); everything here is
// testable without storage.

import { classifyAccount, splitAccount, isProfitAndLoss, type BsGroupDef } from "@/lib/financials/balance-sheet/classify";
import type { GlTransaction } from "@/lib/financials/operating-statements/glParser";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const TOL = 0.5;

/** What an account IS, for the purpose of proving it. Finer than the balance
 *  sheet's groups: the sheet lumps receivables together, a workpaper proves
 *  trade receivables against the aging and unbilled CAM against the recon. */
export type WpKind =
  | "cash" | "restricted" | "suspense" | "receivable" | "unbilled" | "intercompany"
  | "prepaid" | "escrow" | "fixedAsset" | "accumDep" | "deferred" | "otherAsset"
  | "payable" | "sdPayable" | "taxPayable" | "accrued" | "mortgage" | "capital" | "clearing";

export const KIND_INFO: Record<WpKind, { label: string; section: "Cash" | "Receivables" | "Prepaids & Escrows" | "Property & Deferred Costs" | "Payables & Accruals" | "Debt" | "Partners' Capital" | "Suspense & Clearing"; support: string }> = {
  cash:         { label: "Cash",                    section: "Cash",                      support: "Bank statement — Bank Recs" },
  restricted:   { label: "Restricted cash",         section: "Cash",                      support: "Bank statement — security deposit account" },
  suspense:     { label: "Suspense",                section: "Suspense & Clearing",       support: "Should be $0 — every entry moved to its real account" },
  clearing:     { label: "Clearing",                section: "Suspense & Clearing",       support: "Should be $0 at quarter end" },
  receivable:   { label: "Receivable",              section: "Receivables",               support: "Tenant aging — Skyline Aging Report at the quarter end" },
  unbilled:     { label: "Unbilled receivable",     section: "Receivables",               support: "Year-end adjustments billed — CAM Reconciliation" },
  intercompany: { label: "Intercompany",            section: "Receivables",               support: "The other entity's matching balance" },
  prepaid:      { label: "Prepaid",                 section: "Prepaids & Escrows",        support: "Premium / bill paid less the months expensed" },
  escrow:       { label: "Escrow",                  section: "Prepaids & Escrows",        support: "Lender escrow statement" },
  fixedAsset:   { label: "Property, at cost",       section: "Property & Deferred Costs", support: "Additions — invoices for capital work" },
  accumDep:     { label: "Accumulated depreciation",section: "Property & Deferred Costs", support: "Depreciation schedule — posted by the accountants" },
  deferred:     { label: "Deferred cost",           section: "Property & Deferred Costs", support: "Costs added less amortization" },
  otherAsset:   { label: "Other asset",             section: "Property & Deferred Costs", support: "Detail of each entry" },
  payable:      { label: "Accounts payable",        section: "Payables & Accruals",       support: "Vendor aging — Skyline AP Aged Trial Balance" },
  sdPayable:    { label: "Security deposits owed",  section: "Payables & Accruals",       support: "Deposit register — Security Deposits" },
  taxPayable:   { label: "Tax payable",             section: "Payables & Accruals",       support: "Billed to tenants less paid to the city" },
  accrued:      { label: "Accrued liability",       section: "Payables & Accruals",       support: "Each accrual and its reversal" },
  mortgage:     { label: "Mortgage",                section: "Debt",                      support: "Lender's amortization — Debt Tracker" },
  capital:      { label: "Partners' capital",       section: "Partners' Capital",         support: "Contributions and distributions by partner" },
};

export const SECTION_ORDER = [
  "Cash", "Receivables", "Prepaids & Escrows", "Property & Deferred Costs",
  "Payables & Accruals", "Debt", "Partners' Capital", "Suspense & Clearing",
] as const;
export type WpSection = (typeof SECTION_ORDER)[number];

/** The kind of a balance-sheet account (or the P&L clearing account), or null. */
export function kindOf(code: string, name = "", group?: BsGroupDef | null): WpKind | null {
  const s = splitAccount(code);
  if (!s) return null;
  const { major, sub } = s;
  if (major === 9990) return "clearing";
  if (isProfitAndLoss(code)) return null;
  if (major === 300) return "suspense";
  if (major === 460) return "clearing";
  if (major >= 110 && major <= 139) return "cash";
  if (major >= 250 && major <= 299) return "restricted";
  if (major >= 430 && major <= 439) return "intercompany";
  if (major === 450 && sub !== "0000" && /unbill/i.test(name)) return "unbilled";
  if (major === 450 && ["0001", "0002", "0003", "0004"].includes(sub)) return "unbilled";
  if (major >= 410 && major <= 459) return "receivable";
  if (major >= 1510 && major <= 1599) return "accumDep";
  if (major >= 1740 && major <= 1769) return "accumDep";
  if (major === 1940) return sub === "0000" ? "accumDep" : "deferred";
  if (major >= 1860 && major <= 1899) return "escrow";
  if (major >= 1910 && major <= 1939) return "prepaid";
  if (major >= 1950 && major <= 1979) return "deferred";
  if ((major >= 560 && major <= 799) || (major >= 1410 && major <= 1499) || (major >= 1610 && major <= 1699) || (major >= 1810 && major <= 1849) || major === 1980) return "fixedAsset";
  if (major === 510 || major === 520) return "fixedAsset";
  if (major >= 1960 && major <= 1999) return "otherAsset";
  if (major >= 2110 && major <= 2129) return "payable";
  if (major >= 2130 && major <= 2139) return "sdPayable";
  if (major === 2430 || major === 2230 || major === 2120) return "taxPayable";
  if (major === 2750) return "intercompany";
  if (major >= 2700 && major <= 2799) return "mortgage";
  if (major >= 2140 && major <= 2699) return "accrued";
  if (major === 2970) return "escrow";
  if (major >= 2800 && major <= 2999) return "accrued";
  if (major >= 3200 && major <= 3799) return "capital";
  // Anything else on the balance-sheet side: fall back to its sheet group.
  switch (group?.key) {
    case "cash": return "cash";
    case "restricted": return "restricted";
    case "receivables": return "receivable";
    case "prepaid": return "prepaid";
    case "dueFrom": case "dueTo": return "intercompany";
    case "realEstate": return "fixedAsset";
    case "accumDep": return "accumDep";
    case "deferred": return "deferred";
    case "escrow": return "escrow";
    case "payables": return "accrued";
    case "sdPayable": return "sdPayable";
    case "mortgage": return "mortgage";
    case "capital": return "capital";
  }
  return "otherAsset";
}

export type FlagLevel = "red" | "amber" | "info";
export interface WpFlag { level: FlagLevel; text: string }

export interface WpLine { date: string | null; month: number; description: string; ref: string; amount: number }

/** An outside source the balance is checked against (bank rec, lender schedule…). */
export interface WpSupport {
  label: string;
  /** The independent figure, signed the way the GL signs the account. */
  amount: number | null;
  ties: boolean | null;
  difference: number | null;
  note?: string;
}

export interface WpSchedule {
  code: string;
  name: string;
  kind: WpKind;
  section: WpSection;
  /** Signed as the GL signs it (assets +, liabilities / capital −). */
  opening: number;
  activity: number;
  ending: number;
  debits: number;
  credits: number;
  lines: WpLine[];
  /** "full" = transaction detail explains the balance, "none" = totals only. */
  detail: "full" | "none";
  /** Opening + the lines − the ending balance. Zero when the GL's detail is whole. */
  unexplained: number;
  support: WpSupport | null;
  flags: WpFlag[];
  /** "ok" | "review" (amber only) | "fix" (any red). */
  status: "ok" | "review" | "fix";
}

export interface WpInput {
  key: string;
  year: number;
  /** Quarter-end month: 3, 6, 9 or 12. */
  asOfMonth: number;
  gl: {
    beginning?: Record<string, number>;
    monthly: Record<string, number[]>;
    names?: Record<string, string>;
    coverageStartMonth?: number;
  };
  /** account → transactions (any months; filtered to ≤ asOfMonth here). Absent → totals only. */
  transactions?: Record<string, GlTransaction[]> | null;
  overrides?: Record<string, string>;
  /** Independent checks the route found, by kind. */
  sources?: {
    /** Lender schedule principal at the as-of date (positive). */
    debtPrincipal?: { amount: number; loans: number } | null;
    /** Deposits register: what we hold for this property's tenants (positive). */
    depositsHeld?: number | null;
    /** Skyline's AP Aged Trial Balance at the quarter end: what vendors are
     *  owed (positive), and its invoices the books' payables never carried. */
    apAging?: { asOf: string; total: number; invoices: number; notInBooks: { vendor: string; date: string | null; amount: number }[] } | null;
    /** Skyline's tenant Aging Report at the quarter end: what tenants owe net
     *  of their credits, and the largest balances behind it. */
    arAging?: { asOf: string; total: number; charges: number; credits: number; tenants: number; top: { unitRef: string; tenantName: string; balance: number; former: boolean }[]} | null;
    /** Bank rec: Skyline register vs this GL's cash at month end. */
    bankRec?: { period: string; skyline: number; gl: number | null; difference: number | null; signedOff: boolean } | null;
  };
}

export interface Workpapers {
  key: string;
  year: number;
  asOfMonth: number;
  asOfDate: string;
  quarter: number;
  schedules: WpSchedule[];
  /** Trial balance proof: every account (incl. P&L) sums to zero. */
  trialBalance: { debits: number; credits: number; net: number; balances: boolean };
  /** Every account, the Trial Balance Detail Report the accountants start from. */
  tbRows: { code: string; name: string; opening: number; debits: number; credits: number; ending: number }[];
  counts: { accounts: number; ok: number; review: number; fix: number };
  detailAvailable: boolean;
  warnings: string[];
}

const norm = (s: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const fmt = (n: number) => "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => (n < 0 ? `(${fmt(n)})` : fmt(n));
const fmt0 = (n: number) => "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
const mdy = (iso: string | null) => {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[2])}/${Number(m[3])}` : iso;
};
const dayNum = (iso: string | null) => {
  const m = iso && /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
};

/**
 * Pairs of entries that look like the same bill booked twice: same amount,
 * same description, within 120 days — and NOT a recurring entry (the same
 * amount and description in 3+ months is a monthly amortization or rent, not
 * a duplicate). A later reversal of the same amount is reported with it.
 */
export function possibleDuplicates(lines: WpLine[], minAmount = 250): { a: WpLine; b: WpLine; reversed: WpLine | null }[] {
  const out: { a: WpLine; b: WpLine; reversed: WpLine | null }[] = [];
  const groups = new Map<string, WpLine[]>();
  for (const l of lines) {
    if (Math.abs(l.amount) < minAmount) continue;
    const k = `${norm(l.description)}|${round2(l.amount)}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(l);
  }
  for (const g of groups.values()) {
    if (g.length !== 2) continue; // 3+ is a recurring entry
    const [a, b] = g;
    const da = dayNum(a.date), db = dayNum(b.date);
    if (da != null && db != null && Math.abs(db - da) > 120) continue;
    if (norm(a.description) === "" ) continue;
    const later = Math.max(da ?? 0, db ?? 0);
    const reversed = lines.find((l) => round2(l.amount) === round2(-a.amount) && (dayNum(l.date) ?? 0) >= later) ?? null;
    out.push({ a, b, reversed });
  }
  return out;
}

export function computeWorkpapers(input: WpInput): Workpapers {
  const { key, year, gl, overrides, sources } = input;
  const asOfMonth = Math.min(12, Math.max(1, input.asOfMonth));
  const quarter = Math.ceil(asOfMonth / 3);
  const warnings: string[] = [];
  const hasOpenings = !!gl.beginning && Object.keys(gl.beginning).length > 0;
  if (!hasOpenings) warnings.push("This General Ledger has no beginning balances, so the balances can't be proven. Re-export it with the Beginning Balance column.");
  if ((gl.coverageStartMonth ?? 1) > 1) warnings.push(`The General Ledger starts in month ${gl.coverageStartMonth}. Import the year from January so the opening balances are January 1's.`);
  const tx = input.transactions ?? null;
  const detailAvailable = !!tx && Object.keys(tx).length > 0;
  if (!detailAvailable) warnings.push("This year's General Ledger was imported as monthly totals only, so the entries behind each balance aren't listed. Re-import it without \"Import monthly totals only\".");

  const codes = [...new Set([...Object.keys(gl.monthly ?? {}), ...Object.keys(gl.beginning ?? {})])].sort();

  // Trial balance proof over EVERY account (P&L included).
  let tbDebits = 0, tbCredits = 0, tbNet = 0;
  const balance = (code: string) => {
    let b = gl.beginning?.[code] ?? 0;
    const nets = gl.monthly?.[code] ?? [];
    for (let i = 0; i < asOfMonth; i++) b += nets[i] || 0;
    return round2(b);
  };

  const schedules: WpSchedule[] = [];
  const tbRows: Workpapers["tbRows"] = [];
  for (const code of codes) {
    const ending = balance(code);
    tbNet += ending;
    if (ending > 0) tbDebits += ending; else tbCredits -= ending;
    {
      const op = round2(gl.beginning?.[code] ?? 0);
      const txs = (tx?.[code] ?? []).filter((t) => t.month >= 1 && t.month <= asOfMonth);
      let dr = 0, cr = 0;
      if (detailAvailable) for (const t of txs) { if (t.amount > 0) dr += t.amount; else cr -= t.amount; }
      else for (let i = 0; i < asOfMonth; i++) { const v = gl.monthly?.[code]?.[i] || 0; if (v > 0) dr += v; else cr -= v; }
      // Detail that doesn't explain the balance: carry the gap so the row still foots.
      const gap = round2(ending - op - (dr - cr));
      if (gap > 0) dr += gap; else cr -= gap;
      if (Math.abs(op) >= 0.005 || Math.abs(ending) >= 0.005 || dr || cr)
        tbRows.push({ code, name: gl.names?.[code] ?? "", opening: op, debits: round2(dr), credits: round2(cr), ending });
    }

    const name = gl.names?.[code] ?? "";
    const group = isProfitAndLoss(code) ? null : classifyAccount(code, name, overrides);
    const kind = kindOf(code, name, group);
    if (!kind) continue;
    const opening = round2(gl.beginning?.[code] ?? 0);
    const activity = round2(ending - opening);
    // P&L clearing: only its year-to-date matters, and only when not zero.
    if (kind === "clearing" && isProfitAndLoss(code) && Math.abs(ending) < TOL) continue;
    const raw = (tx?.[code] ?? []).filter((t) => t.month >= 1 && t.month <= asOfMonth);
    if (Math.abs(ending) < TOL && Math.abs(opening) < TOL && raw.length === 0 && Math.abs(activity) < TOL) continue;

    const lines: WpLine[] = raw
      .map((t) => ({ date: t.date, month: t.month, description: (t.vendor && !t.description.includes(t.vendor) ? `${t.vendor} — ${t.description}` : t.description).trim(), ref: t.ref, amount: round2(t.amount) }))
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.month - b.month);
    const linesTotal = round2(lines.reduce((s, l) => s + l.amount, 0));
    const debits = round2(lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
    const credits = round2(-lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0));
    const detail: WpSchedule["detail"] = detailAvailable ? "full" : "none";
    const unexplained = detail === "full" ? round2(activity - linesTotal) : 0;

    const flags: WpFlag[] = [];
    if (detail === "full" && Math.abs(unexplained) >= TOL) {
      flags.push({ level: "red", text: `The ledger's entries don't add up to the balance — ${fmt(unexplained)} isn't explained by any entry. A General Ledger import may be missing a month.` });
    }
    if (kind === "suspense" && Math.abs(ending) >= TOL) {
      flags.push({ level: "red", text: `${fmt(ending)} is sitting in Suspense. Every dollar here is unexplained — trace each entry and move it to its real account.` });
    }
    if (kind === "clearing" && Math.abs(ending) >= TOL) {
      flags.push({ level: "red", text: `${fmt(ending)} left in a clearing account. It should be $0 at quarter end — find what didn't clear.` });
    }
    if (kind === "unbilled" && ending <= -TOL) {
      flags.push({ level: "amber", text: `Credit balance of ${fmt(ending)}. Unbilled CAM / tax should read as money tenants still owe — confirm each year-end adjustment here was billed, and billed once.` });
    }
    if (kind === "receivable" && code.startsWith("0420") && ending <= -TOL) {
      flags.push({ level: "amber", text: `Tenants are net in credit by ${fmt(ending)} — overpayments and prepaid rent. Check Open Credits that each is real and applied.` });
    }
    if (["prepaid", "escrow", "deferred", "otherAsset"].includes(kind) && ending <= -TOL) {
      flags.push({ level: "amber", text: `Reads negative (${fmt(ending)}). An asset can't be below zero — the expense was likely booked ahead of the payment, or a payment is missing.` });
    }
    if (["payable", "accrued", "sdPayable", "taxPayable"].includes(kind) && ending >= TOL) {
      flags.push({ level: "amber", text: `Reads as money owed TO us (${fmt(ending)}). A payable should be a credit — a bill paid twice, or paid but never entered.` });
    }
    const quietKinds: WpKind[] = ["receivable", "prepaid", "accrued", "payable", "intercompany", "deferred", "otherAsset", "escrow", "taxPayable"];
    if (quietKinds.includes(kind) && Math.abs(ending) >= 100 && detail === "full" && lines.length === 0) {
      flags.push({ level: "info", text: `No activity this year and still ${fmt(ending)}. Confirm it's still owed / still valid, or clear it.` });
    }
    if (detail === "full" && !["cash", "restricted", "capital"].includes(kind)) {
      for (const d of possibleDuplicates(lines)) {
        const base = `Possible duplicate: ${fmt(d.a.amount)} "${d.a.description}" on ${mdy(d.a.date)} and again on ${mdy(d.b.date)}`;
        flags.push(d.reversed
          ? { level: "info", text: `${base} — reversed on ${mdy(d.reversed.date)}.` }
          : { level: "amber", text: `${base}. Confirm it isn't the same bill twice.` });
      }
    }

    schedules.push({
      code, name, kind, section: KIND_INFO[kind].section,
      opening, activity, ending, debits, credits, lines, detail, unexplained,
      support: null, flags, status: "ok",
    });
  }

  // ── Independent checks, by kind ──────────────────────────────────────────
  // Mortgage: principal = the notes payable (credit) net of the amortization
  // paid (debit), against the lender's schedule.
  const debt = schedules.filter((s) => s.kind === "mortgage" && /^27[0-4]\d/.test(s.code));
  if (debt.length && sources?.debtPrincipal) {
    const ledger = round2(-debt.reduce((t, s) => t + s.ending, 0));
    const diff = round2(ledger - sources.debtPrincipal.amount);
    const ties = Math.abs(diff) < 1;
    const support: WpSupport = {
      label: `Debt Tracker — ${sources.debtPrincipal.loans} loan${sources.debtPrincipal.loans === 1 ? "" : "s"}`,
      amount: sources.debtPrincipal.amount, ties, difference: diff,
      note: `Principal per the ledger ${fmt0(ledger)} vs the lender's schedule ${fmt0(sources.debtPrincipal.amount)}.`,
    };
    for (const s of debt) s.support = support;
    if (!ties) debt[0].flags.push({ level: "red", text: `Mortgage principal on the books (${fmt0(ledger)}) doesn't match the lender's schedule (${fmt0(sources.debtPrincipal.amount)}) — off by ${fmt0(diff)}. A principal payment is likely posted to the wrong month or account.` });
  }
  const sd = schedules.filter((s) => s.kind === "sdPayable");
  if (sources?.depositsHeld != null && (sd.length || sources.depositsHeld > 0)) {
    const ledger = round2(-sd.reduce((t, s) => t + s.ending, 0));
    const diff = round2(ledger - sources.depositsHeld);
    const ties = Math.abs(diff) < 1;
    const support: WpSupport = { label: "Security Deposits register", amount: sources.depositsHeld, ties, difference: diff,
      note: `Owed back to tenants per the ledger ${fmt0(ledger)} vs the deposits on file ${fmt0(sources.depositsHeld)}.` };
    for (const s of sd) s.support = support;
    if (!ties) {
      const target = sd[0];
      const flag: WpFlag = { level: "amber", text: `Deposits owed to tenants on the books (${fmt0(ledger)}) don't match the Security Deposits register (${fmt0(sources.depositsHeld)}). A deposit received, refunded or transferred may not be recorded on one side.` };
      if (target) target.flags.push(flag);
      else schedules.push({ code: "2130-0000", name: "Security Deposit Payable", kind: "sdPayable", section: "Payables & Accruals", opening: 0, activity: 0, ending: 0, debits: 0, credits: 0, lines: [], detail: detailAvailable ? "full" : "none", unexplained: 0, support, flags: [flag], status: "ok" });
    }
  }
  if (sources?.bankRec) {
    const br = sources.bankRec;
    const cash = schedules.filter((s) => s.kind === "cash" || s.kind === "restricted");
    const ties = br.difference != null && Math.abs(br.difference) < 1;
    const support: WpSupport = { label: `Bank Recs — ${br.period}${br.signedOff ? " (signed off)" : ""}`, amount: br.skyline, ties: br.difference == null ? null : ties, difference: br.difference,
      note: br.difference == null ? "The bank rec couldn't compare this property's General Ledger cash." : `Skyline's bank register ${fmt0(br.skyline)} vs the General Ledger's cash ${fmt0(br.gl ?? 0)}.` };
    for (const s of cash) s.support = support;
    if (cash.length && br.difference != null && !ties) cash[0].flags.push({ level: "red", text: `Cash on the books doesn't match the bank rec — off by ${fmt0(br.difference)}. See Bank Recs for the entries on one side only.` });
  }

  // Trade receivables against the tenant aging (the accountants' A/R tab).
  // Only 042x — unbilled CAM / tax is proven by the recon, not the aging.
  const ar = schedules.filter((s) => /^042\d-/.test(s.code));
  if (sources?.arAging && ar.length) {
    const ag = sources.arAging;
    const ledger = round2(ar.reduce((t, s) => t + s.ending, 0));
    const diff = round2(ledger - ag.total);
    const ties = Math.abs(diff) < 1;
    const support: WpSupport = { label: `Tenant aging — ${ag.tenants} tenant${ag.tenants === 1 ? "" : "s"}`, amount: ag.total, ties, difference: diff,
      note: `Owed by tenants per the books ${signed(ledger)} vs Skyline's tenant aging ${signed(ag.total)} (charges ${fmt(ag.charges)}, credits ${fmt(ag.credits)}).` };
    for (const s of ar) s.support = support;
    if (!ties) {
      const exact = ag.top.filter((t) => Math.abs(Math.abs(t.balance) - Math.abs(diff)) < 0.01);
      const hint = exact.length
        ? ` The gap is exactly ${exact.map((t) => `${t.tenantName} (${t.unitRef}, ${signed(t.balance)})`).join(" or ")} — a balance booked to another property or account, or one side of a write-off.`
        : " A payment or charge posted to the wrong property, a write-off on one side only, or a tenant the aging left out.";
      ar[0].flags.push({ level: "amber", text: `What tenants owe on the books (${signed(ledger)}) doesn't match the tenant aging (${signed(ag.total)}) — off by ${fmt(diff)}.${hint}` });
    }
    // The 0420 credit flag is answered by the aging when it ties.
    if (ties) for (const s of ar) s.flags = s.flags.filter((f) => !f.text.startsWith("Tenants are net in credit"));
  }

  // Accounts payable against the vendor aging (the accountants' AP tab).
  const ap = schedules.filter((s) => /^211\d-/.test(s.code));
  if (sources?.apAging && ap.length) {
    const ag = sources.apAging;
    const ledger = round2(-ap.reduce((t, s) => t + s.ending, 0));
    const diff = round2(ledger - ag.total);
    const ties = Math.abs(diff) < 1;
    const support: WpSupport = { label: `AP Aged Trial Balance — ${ag.invoices} invoices`, amount: ag.total, ties, difference: diff,
      note: `Owed to vendors per the books ${fmt(ledger)} vs Skyline's vendor aging ${fmt(ag.total)}.` };
    for (const s of ap) s.support = support;
    if (!ties) {
      // Bills the books never carried. When only SOME of them make up the gap
      // (the rest were posted in a batch the per-bill match can't see), those
      // that do are still the timing.
      const late = Math.abs(round2(-diff) - round2(ag.notInBooks.reduce((a, i) => a + i.amount, 0))) < 1
        ? ag.notInBooks
        : subsetSumming(ag.notInBooks, round2(-diff)) ?? ag.notInBooks;
      const lateSum = round2(late.reduce((a, i) => a + i.amount, 0));
      const list = late.slice(0, 4).map((i) => `${i.vendor} ${fmt(i.amount)}${i.date ? ` (${mdy(i.date)})` : ""}`).join(", ") + (late.length > 4 ? ` and ${late.length - 4} more` : "");
      if (late.length && Math.abs(round2(-diff) - lateSum) < 1) {
        ap[0].flags.push({ level: "info", text: `The vendor aging is ${fmt(diff)} higher than the books — exactly ${late.length === 1 ? "a bill" : `${late.length} bills`} dated before the quarter end but entered after it: ${list}. Timing, not an error.` });
      } else {
        ap[0].flags.push({ level: "amber", text: `Owed to vendors on the books (${fmt(ledger)}) doesn't match the vendor aging (${fmt(ag.total)}) — off by ${fmt(diff)}.${late.length ? ` On the aging but not found in the books' payables: ${list}.` : ""} A bill posted to the wrong property, or a payment on one side only.` });
      }
    }
  }

  for (const s of schedules) s.status = s.flags.some((f) => f.level === "red") ? "fix" : s.flags.some((f) => f.level === "amber") ? "review" : "ok";
  schedules.sort((a, b) => SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || a.code.localeCompare(b.code));

  const tbBalances = Math.abs(round2(tbNet)) < TOL;
  if (hasOpenings && !tbBalances) warnings.push(`The trial balance is out by ${fmt(tbNet)} — debits and credits should be equal. The General Ledger is likely incomplete.`);

  return {
    key, year, asOfMonth, quarter,
    asOfDate: `${year}-${String(asOfMonth).padStart(2, "0")}-${new Date(Date.UTC(year, asOfMonth, 0)).getUTCDate()}`,
    schedules,
    trialBalance: { debits: round2(tbDebits), credits: round2(tbCredits), net: round2(tbNet), balances: tbBalances },
    tbRows,
    counts: {
      accounts: schedules.length,
      ok: schedules.filter((s) => s.status === "ok").length,
      review: schedules.filter((s) => s.status === "review").length,
      fix: schedules.filter((s) => s.status === "fix").length,
    },
    detailAvailable,
    warnings,
  };
}

/** The fewest of `items` whose amounts add to `target` (to the cent), or null.
 *  Breadth-first over running sums, bounded so a long aging cannot stall. */
export function subsetSumming<T extends { amount: number }>(items: T[], target: number): T[] | null {
  const goal = Math.round(target * 100);
  if (!goal || items.length > 200) return null;
  const cents = items.map((i) => Math.round(i.amount * 100));
  const from = new Map<number, { prev: number; idx: number }>([[0, { prev: 0, idx: -1 }]]);
  for (let i = 0; i < cents.length; i++) {
    for (const sum of [...from.keys()]) {
      const next = sum + cents[i];
      if (from.has(next) || Math.abs(next) > Math.abs(goal) * 4 + 100_000) continue;
      from.set(next, { prev: sum, idx: i });
      if (next === goal) {
        const out: T[] = [];
        let cur = next;
        while (cur !== 0 || out.length === 0) { const step = from.get(cur)!; if (step.idx < 0) break; out.unshift(items[step.idx]); cur = step.prev; }
        return out;
      }
      if (from.size > 200_000) return null;
    }
  }
  return null;
}
