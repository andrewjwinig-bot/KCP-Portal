// Server-side processing of the Allocated Expense Invoicer, split into a
// review-before-send gate so nothing reaches AvidXchange without a person's
// okay:
//
//   prepareAllocation(buf)  — run the moment a 2000 G&A GL is imported. It
//     allocates + decorates carryover + computes the per-building summary, then
//     STAGES a pending send (with the source GL stashed as base64). It does NOT
//     finalize carryover and does NOT email — it just readies the invoices and
//     waits for Harry/Drew to review.
//
//   sendAllocation(period)  — run when the reviewer clicks "Send to
//     AvidXchange". It reloads the pending send, recomputes the exact invoices
//     from the stashed GL, builds the per-property invoice PDFs, records the
//     run(s), finalizes the month(s) (the carryover mutation), and emails AP
//     (Avid) cc the controller + Drew. Marks the pending send sent.
//
// MULTI-MONTH RANGE GLs: a Detailed GL exported for a date range (e.g. Jan–Jun)
// is decomposed into its calendar months by transaction date and processed
// month-by-month IN ORDER, so carryover chains correctly (a balance held in
// January rolls into February, etc.) and every month books its own invoices.
// A single-month GL is just the one-element case of the same machinery.
//
// IDEMPOTENT — the same month is never processed twice, even if the GL is
// re-imported: each month already in the carryover ledger's committedPeriods is
// skipped (prepare won't re-stage it, send won't re-finalize it), and a pending
// send that's already been sent stays sent.

import "server-only";
import { createHash } from "crypto";
import { parseGLExcel, type GLParseResult, type GLTransaction, type GLAccountTotal } from "./glParser";
import { ALLOC_PCT, PROPERTY_DEFS } from "@/lib/properties/data";
import {
  CARRYOVER_THRESHOLD,
  isYearEndMonth,
  baseAccountCode,
  finalizeMonth,
  recognizedFor,
  isMonthBaselined,
  applyRecognized,
  applyCatchupToLedger,
  type MonthExpense,
  type CarryoverLedger,
  type RecognizedUpdate,
} from "./carryover";
import { getAllocLedger, saveAllocLedger } from "./carryoverStore";
import { reconcileAllocation } from "./tieOut";
import { recordAllocationRun } from "./runStore";
import { buildAllocExportXlsx, type AllocExportRow } from "./export";
import { buildAllocInvoicePdf, makeAllocInvoiceId, type AllocLineItem } from "./invoice";
import JSZip from "jszip";
import { reportAlreadySent, markReportSent } from "@/lib/invoicing/reportSent";
import { markTaskComplete } from "@/lib/tracker/completionStore";
import {
  savePendingSend,
  getPendingSend,
  markPendingSent,
} from "./pendingSendStore";
import { getPendingGl } from "./pendingGlStore";
import { deliverInvoicesToAvid, type AvidInvoicePdf } from "@/lib/invoicing/avidDelivery";

// Invoices go to AP (Avid) for processing; the team summary ccs Drew + Harry
// (matching CC & Payroll for one consistent recipient set across all flows).
const AVID_TO = "kormancommercial@avidbill.com";
const REPORT_CC_DREW = "dwinig@kormancommercial.com";
const REPORT_CC_HARRY = "hfeldman@kormancommercial.com";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function propName(id: string): string {
  return PROPERTY_DEFS.find((p) => p.id === id)?.name ?? id;
}

// One base GL account's allocation to one property, decorated with its carried
// balance and hold decision for the statement month.
type DecAcct = { base: string; name: string; thisMonth: number; prior: number; accrued: number; billed: boolean; rows: AllocExportRow[] };

export type ComputedAllocation = {
  gl: GLParseResult;
  statementMonth: string;
  rows: AllocExportRow[];
  decByProp: Map<string, DecAcct[]>;
  byProperty: { code: string; name: string; amount: number }[];
  total: number;
  expenses: MonthExpense[];
  /** True for the supplemental catch-up batch (late charges to already-finalized
   *  months), so its invoices are labeled + filed distinctly from a normal month. */
  supplemental?: boolean;
  /** For a catch-up: the source months whose late charges it sweeps up. */
  sourceMonths?: string[];
};

// ── Month splitting (single-month GL → [gl]; range GL → per-month buckets) ─────

function monthKeyOf(date: string): string | null {
  const m = String(date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const yyyy = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${yyyy}-${m[1].padStart(2, "0")}`;
}
function lastDayOfMonth(ym: string): string {
  const [y, mo] = ym.split("-").map(Number);
  const d = new Date(y, mo, 0).getDate();
  return `${ym}-${String(d).padStart(2, "0")}`;
}
function accountTotalsFor(txs: GLTransaction[]): Map<string, GLAccountTotal> {
  const m = new Map<string, GLAccountTotal>();
  for (const tx of txs) {
    const e = m.get(tx.accountCode);
    if (e) e.netTotal += tx.net;
    else m.set(tx.accountCode, { accountCode: tx.accountCode, accountName: tx.accountName, accountSuffix: tx.accountSuffix, netTotal: tx.net });
  }
  return m;
}

/** Split a GL into per-calendar-month buckets. A single-month GL (statement
 *  month "YYYY-MM") is returned as-is; a range GL ("YYYY-MM_to_YYYY-MM") is
 *  bucketed by transaction date and returned in ascending month order. */
export function splitIntoMonths(gl: GLParseResult): GLParseResult[] {
  if (/^\d{4}-\d{2}$/.test(gl.statementMonth)) return [gl];
  const byMonth = new Map<string, GLTransaction[]>();
  for (const tx of gl.transactions) {
    const k = monthKeyOf(tx.date);
    if (!k) continue;
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(tx);
  }
  return [...byMonth.keys()].sort().map((k) => ({
    statementMonth: k,
    periodText: new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }),
    periodEndDate: lastDayOfMonth(k),
    transactions: byMonth.get(k)!,
    accountTotals: accountTotalsFor(byMonth.get(k)!),
  }));
}

/** One month's allocation grouped by (property → base account): the current
 *  allocated amount + its line-item rows. The raw allocation before any carryover
 *  decoration — shared by the fresh-month compute and the delta detection. */
type AllocEntry = { name: string; thisMonth: number; rows: AllocExportRow[] };
function allocateMonth(monthGl: GLParseResult): Map<string, Map<string, AllocEntry>> {
  const propIds = Object.keys(ALLOC_PCT);
  const byProp = new Map<string, Map<string, AllocEntry>>();
  for (const acc of monthGl.accountTotals.values()) {
    for (const id of propIds) {
      const pct = ALLOC_PCT[id]?.[acc.accountSuffix] ?? 0;
      if (pct === 0) continue;
      const row: AllocExportRow = {
        propertyId: id, propertyName: propName(id),
        accountCode: acc.accountCode, accountName: acc.accountName, accountSuffix: acc.accountSuffix,
        grossAmount: acc.netTotal, allocPct: pct, allocAmount: round2(acc.netTotal * pct),
      };
      const base = baseAccountCode(row.accountCode);
      if (!byProp.has(id)) byProp.set(id, new Map());
      const am = byProp.get(id)!;
      const cur = am.get(base) ?? { name: row.accountName, thisMonth: 0, rows: [] as AllocExportRow[] };
      cur.thisMonth = round2(cur.thisMonth + row.allocAmount);
      cur.rows.push(row);
      am.set(base, cur);
    }
  }
  return byProp;
}

/** RecognizedUpdate rows for one month (the current allocation per pid/base). */
function recognizedUpdatesFor(byProp: Map<string, Map<string, AllocEntry>>, statementMonth: string): RecognizedUpdate[] {
  const out: RecognizedUpdate[] = [];
  for (const [pid, am] of byProp) for (const [base, g] of am) out.push({ propertyId: pid, accountCode: base, statementMonth, amount: g.thisMonth });
  return out;
}

/**
 * Allocate one month against a given ledger snapshot — allocate each
 * 9301/9302/9303 account across its properties (ALLOC_PCT), decorate with
 * carryover, and roll up the per-building billing totals. No side effects.
 */
function computeOneMonth(monthGl: GLParseResult, ledger: CarryoverLedger): ComputedAllocation | { error: string } {
  const statementMonth = monthGl.statementMonth;
  if (!/^\d{4}-\d{2}$/.test(statementMonth)) return { error: "no-statement-month" };
  const propIds = Object.keys(ALLOC_PCT);

  // 1) Allocation rows — each account × property share by suffix.
  const rows: AllocExportRow[] = [];
  for (const acc of monthGl.accountTotals.values()) {
    for (const id of propIds) {
      const pct = ALLOC_PCT[id]?.[acc.accountSuffix] ?? 0;
      if (pct === 0) continue;
      rows.push({
        propertyId: id, propertyName: propName(id),
        accountCode: acc.accountCode, accountName: acc.accountName, accountSuffix: acc.accountSuffix,
        grossAmount: acc.netTotal, allocPct: pct, allocAmount: round2(acc.netTotal * pct),
      });
    }
  }

  // 2) Carryover decoration.
  const yearEnd = isYearEndMonth(statementMonth);
  const byProp = new Map<string, Map<string, { name: string; thisMonth: number; rows: AllocExportRow[] }>>();
  for (const r of rows) {
    const base = baseAccountCode(r.accountCode);
    if (!byProp.has(r.propertyId)) byProp.set(r.propertyId, new Map());
    const am = byProp.get(r.propertyId)!;
    const cur = am.get(base) ?? { name: r.accountName, thisMonth: 0, rows: [] as AllocExportRow[] };
    cur.thisMonth = round2(cur.thisMonth + r.allocAmount);
    cur.rows.push(r);
    am.set(base, cur);
  }

  const billingTotals = new Map<string, number>();
  const expenses: MonthExpense[] = [];
  const decByProp = new Map<string, DecAcct[]>();
  for (const id of propIds) {
    const am = byProp.get(id);
    const seen = new Set<string>();
    const decs: DecAcct[] = [];
    if (am) {
      for (const [base, g] of am) {
        seen.add(base);
        const prior = round2(ledger.balances[id]?.accounts?.[base]?.heldTotal ?? 0);
        const accrued = round2(g.thisMonth + prior);
        const billed = yearEnd || accrued >= CARRYOVER_THRESHOLD;
        decs.push({ base, name: g.name, thisMonth: g.thisMonth, prior, accrued, billed, rows: g.rows });
        if (billed) billingTotals.set(id, round2((billingTotals.get(id) ?? 0) + accrued));
        if (g.thisMonth !== 0) expenses.push({ propertyId: id, accountCode: base, accountName: g.name, amount: g.thisMonth });
      }
    }
    const pc = ledger.balances[id];
    if (pc) {
      for (const [base, carry] of Object.entries(pc.accounts)) {
        if (seen.has(base)) continue;
        const prior = round2(carry.heldTotal);
        const billed = yearEnd;
        decs.push({ base, name: carry.accountName, thisMonth: 0, prior, accrued: prior, billed, rows: [] });
        if (billed) billingTotals.set(id, round2((billingTotals.get(id) ?? 0) + prior));
      }
    }
    if (decs.length) decByProp.set(id, decs);
  }

  const byProperty = propIds
    .map((id) => ({ code: id, name: propName(id), amount: round2(billingTotals.get(id) ?? 0) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const total = round2(byProperty.reduce((s, x) => s + x.amount, 0));

  return { gl: monthGl, statementMonth, rows, decByProp, byProperty, total, expenses };
}

export type MonthsResult = {
  /** Uncommitted months still to process, in chronological order. */
  months: ComputedAllocation[];
  /** Supplemental catch-up batch for late charges to already-finalized months
   *  (null when there are none) — the "loss of recovery" guard. */
  catchup: ComputedAllocation | null;
  /** Months skipped (already finalized with no new charges, or a legacy month
   *  whose baseline was just backfilled). */
  skipped: string[];
  /** Recognized-amount updates to apply on finalize (every month's current
   *  allocation), so a later re-import bills only the delta. */
  recognizedUpdates: RecognizedUpdate[];
  /** Combined per-building totals across `months` + `catchup`. */
  byProperty: { code: string; name: string; amount: number }[];
  total: number;
  /** Total invoices across all months + catch-up. */
  invoiceCount: number;
};

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

/** Build the supplemental catch-up allocation from accumulated per-account deltas,
 *  billed against the held balance after the fresh months. Null when empty. */
type CatchupEntry = { name: string; delta: number; suffix: "9301" | "9302" | "9303" };
function buildCatchup(
  catchup: Map<string, Map<string, CatchupEntry>>,
  sourceMonths: string[],
  ledger: CarryoverLedger,
): ComputedAllocation | null {
  if (!catchup.size) return null;
  const months = [...sourceMonths].sort();
  const asOfMonth = months[months.length - 1];
  const yearEnd = isYearEndMonth(asOfMonth);

  const rows: AllocExportRow[] = [];
  const decByProp = new Map<string, DecAcct[]>();
  const billingTotals = new Map<string, number>();
  const expenses: MonthExpense[] = [];
  for (const [pid, cm] of catchup) {
    const decs: DecAcct[] = [];
    for (const [base, c] of cm) {
      const prior = round2(ledger.balances[pid]?.accounts?.[base]?.heldTotal ?? 0);
      const accrued = round2(c.delta + prior);
      const billed = yearEnd || accrued >= CARRYOVER_THRESHOLD;
      const row: AllocExportRow = { propertyId: pid, propertyName: propName(pid), accountCode: base, accountName: c.name, accountSuffix: c.suffix, grossAmount: c.delta, allocPct: 0, allocAmount: c.delta };
      rows.push(row);
      decs.push({ base, name: c.name, thisMonth: c.delta, prior, accrued, billed, rows: [row] });
      if (billed) billingTotals.set(pid, round2((billingTotals.get(pid) ?? 0) + accrued));
      expenses.push({ propertyId: pid, accountCode: base, accountName: c.name, amount: c.delta });
    }
    if (decs.length) decByProp.set(pid, decs);
  }

  const byProperty = [...billingTotals.entries()].map(([code, amount]) => ({ code, name: propName(code), amount: round2(amount) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = round2(byProperty.reduce((s, x) => s + x.amount, 0));
  const label = months.map(monthLabel).join(", ");
  const gl: GLParseResult = {
    statementMonth: asOfMonth,
    periodText: `Supplemental — late postings (${label})`,
    periodEndDate: lastDayOfMonth(asOfMonth),
    transactions: [],
    accountTotals: new Map(),
  };
  return { gl, statementMonth: asOfMonth, rows, decByProp, byProperty, total, expenses, supplemental: true, sourceMonths: months };
}

/**
 * Compute every month a GL covers, chaining carryover through a working copy of
 * the ledger so a range's later months see the earlier months' held balances.
 *   • A month never processed → a normal per-month invoice batch.
 *   • A month already finalized but with NEW charges since (posted late) → the
 *     delta is swept into the supplemental catch-up.
 *   • A legacy month committed before this feature (no baseline) → its baseline
 *     is backfilled from the current GL and it's skipped (no retro re-bill).
 * Pure — mutates nothing.
 */
export function computeMonths(gl: GLParseResult, ledger: CarryoverLedger): MonthsResult | { error: string } {
  const parts = splitIntoMonths(gl);
  if (!parts.length) return { error: "no-statement-month" };

  let working = ledger;
  const months: ComputedAllocation[] = [];
  const skipped: string[] = [];
  const recognizedUpdates: RecognizedUpdate[] = [];
  const catchup = new Map<string, Map<string, CatchupEntry>>();
  const catchupMonths = new Set<string>();
  const nowISO = new Date().toISOString();

  for (const part of parts) {
    const month = part.statementMonth;
    if (!/^\d{4}-\d{2}$/.test(month)) return { error: "no-statement-month" };
    const byProp = allocateMonth(part);
    recognizedUpdates.push(...recognizedUpdatesFor(byProp, month));

    if (!working.committedPeriods.includes(month)) {
      // Fresh month → normal per-month invoice batch.
      const c = computeOneMonth(part, working);
      if ("error" in c) return { error: c.error };
      months.push(c);
      working = finalizeMonth(working, month, c.expenses, nowISO).ledger;
    } else if (!isMonthBaselined(working, month)) {
      // Legacy committed month (no per-account baseline) → establish the baseline
      // from the current GL, don't re-bill it. Future late charges will be caught.
      working = applyRecognized(working, recognizedUpdatesFor(byProp, month), nowISO);
      skipped.push(month);
    } else {
      // Committed + baselined → catch up any NEW charges since it was finalized.
      let hasDelta = false;
      for (const [pid, am] of byProp) {
        for (const [base, g] of am) {
          const delta = round2(g.thisMonth - recognizedFor(working, pid, base, month));
          if (Math.abs(delta) < 0.005) continue;
          hasDelta = true;
          if (!catchup.has(pid)) catchup.set(pid, new Map());
          const cm = catchup.get(pid)!;
          const cur: CatchupEntry = cm.get(base) ?? { name: g.name, delta: 0, suffix: (g.rows[0]?.accountSuffix ?? "9301") };
          cur.delta = round2(cur.delta + delta);
          cur.name = g.name;
          cm.set(base, cur);
          catchupMonths.add(month);
        }
      }
      if (!hasDelta) skipped.push(month);
    }
  }

  const catchupResult = buildCatchup(catchup, [...catchupMonths], working);

  const map = new Map<string, { code: string; name: string; amount: number }>();
  let invoiceCount = 0;
  const allBatches = [...months, ...(catchupResult ? [catchupResult] : [])];
  for (const m of allBatches) {
    invoiceCount += m.byProperty.length;
    for (const b of m.byProperty) {
      const cur = map.get(b.code) ?? { code: b.code, name: b.name, amount: 0 };
      cur.amount = round2(cur.amount + b.amount);
      map.set(b.code, cur);
    }
  }
  const byProperty = [...map.values()].filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = round2(byProperty.reduce((s, x) => s + x.amount, 0));
  return { months, catchup: catchupResult, skipped, recognizedUpdates, byProperty, total, invoiceCount };
}

// Build one month's per-property invoice PDFs as individual buffers (one per
// billing property). `prefix` names a per-month folder for a range batch (used
// only for the team's zip archive; each PDF is sent to Avid on its own email).
async function buildMonthInvoices(c: ComputedAllocation, prefix: string): Promise<(AvidInvoicePdf & { zipPath: string })[]> {
  const { gl, statementMonth, decByProp } = c;
  const invDate = gl.periodEndDate || new Date().toISOString().slice(0, 10);
  const out: (AvidInvoicePdf & { zipPath: string })[] = [];
  for (const [id, decs] of decByProp) {
    const billed = decs.filter((a) => a.billed);
    const grandTotal = round2(billed.reduce((s, a) => s + a.accrued, 0));
    if (!billed.length || grandTotal <= 0) continue;
    const lineItems: AllocLineItem[] = [];
    const carriedForward: Record<string, { amount: number; accountName: string }> = {};
    for (const a of billed) {
      for (const r of a.rows) {
        lineItems.push({ accountCode: r.accountCode, accountName: r.accountName, accountSuffix: r.accountSuffix, grossAmount: r.grossAmount, allocPct: r.allocPct, allocAmount: r.allocAmount });
      }
      if (a.prior > 0) carriedForward[a.base] = { amount: a.prior, accountName: a.name };
    }
    try {
      const pdf = buildAllocInvoicePdf({
        propertyId: id, propertyName: propName(id),
        periodText: gl.periodText, periodEndDate: gl.periodEndDate, statementMonth,
        invoiceDate: invDate, invoiceId: makeAllocInvoiceId(id),
        lineItems, carriedForward, grandTotal,
      });
      const suppTag = c.supplemental ? " - SUPPLEMENTAL" : "";
      const fileName = `${statementMonth}${suppTag} - ${id} - ${propName(id)}.pdf`;
      out.push({ propertyLabel: `${id} — ${propName(id)}${c.supplemental ? " (supplemental)" : ""}`, fileName, pdf: Buffer.from(await pdf.arrayBuffer()), zipPath: `${prefix}${fileName}` });
    } catch { /* skip a bad PDF, keep the rest */ }
  }
  return out;
}

/** Serialize a GLParseResult (its accountTotals Map → entries) for stashing a
 *  non-Excel source (a posting-report-derived GL) in the pending send. */
export function serializeGl(gl: GLParseResult): string {
  return JSON.stringify({ ...gl, accountTotals: [...gl.accountTotals.entries()] });
}
export function deserializeGl(json: string): GLParseResult {
  const o = JSON.parse(json);
  return { ...o, accountTotals: new Map(o.accountTotals) };
}

/** A content-stable key for a catch-up-only send (its month(s) are all already
 *  finalized, so it can't ride a normal period key). Derived from the deltas, so
 *  re-preparing the same file overwrites the same pending send; once sent, the
 *  recognized ledger updates and a re-import yields no catch-up. */
function catchupKeyFor(c: ComputedAllocation): string {
  const sig = [...c.decByProp.entries()]
    .flatMap(([pid, decs]) => decs.map((d) => `${pid}|${d.base}|${d.thisMonth}`))
    .sort()
    .join(";");
  const h = createHash("sha1").update(`${sig}|${(c.sourceMonths ?? []).join(",")}`).digest("hex").slice(0, 10);
  return `catchup-${h}`;
}

export type PrepareResult = {
  ok: boolean;
  reason?: string;
  statementMonth?: string;
  periodText?: string;
  total?: number;
  byProperty?: { code: string; name: string; amount: number }[];
  invoiceCount?: number;
  /** How many calendar months this run covers (1 for a normal monthly GL). */
  monthCount?: number;
  /** Staged for review — awaiting a "Send to AvidXchange" click. */
  staged?: boolean;
  /** This period was already sent to Avid (idempotent). */
  alreadySent?: boolean;
};

/**
 * Prepare a 2000 G&A GL (single month or a multi-month range): compute the
 * allocation + per-building summary and stash the GL for the send. Does NOT
 * finalize carryover and does NOT email. Never throws.
 */
/** Stage a computed allocation for review. `stash` carries the source to
 *  recompute at send time — an Excel `fileBase64` (a GL upload) or a serialized
 *  `glJson` (a posting-report-derived GL). Shared by both prepare entry points. */
async function prepareStaged(gl: GLParseResult, stash: { fileBase64?: string; glJson?: string }, by?: string | null): Promise<PrepareResult> {
  const ledger = await getAllocLedger();
  const res = computeMonths(gl, ledger);
  if ("error" in res) return { ok: false, reason: res.error };

  const glPeriod = gl.statementMonth; // "YYYY-MM" or "YYYY-MM_to_YYYY-MM"
  if (!glPeriod) return { ok: false, reason: "no-statement-month" };

  // Nothing new at all (no fresh months, no late-charge deltas) → done.
  if (res.months.length === 0 && !res.catchup) {
    return { ok: false, reason: "already-finalized", statementMonth: glPeriod, alreadySent: true };
  }

  // Fresh months → the normal period key (catch-up rides along). Catch-up ONLY
  // (every month already finalized) → a content-stable key so it doesn't collide
  // with the already-sent month.
  const period = res.months.length > 0 ? glPeriod : catchupKeyFor(res.catchup!);
  const label = res.months.length > 0 ? (gl.periodText || glPeriod) : (res.catchup!.gl.periodText || period);

  const existing = await getPendingSend("allocated", period);
  if (existing?.sentAt) return { ok: false, reason: "already-sent", statementMonth: period, alreadySent: true };

  await savePendingSend({
    source: "allocated",
    period,
    label,
    summary: { byProperty: res.byProperty, total: res.total, invoiceCount: res.invoiceCount, tieOut: reconcileAllocation(gl) },
    ...stash,
    preparedAt: new Date().toISOString(),
    preparedBy: by ?? null,
  });

  return {
    ok: true, staged: true,
    statementMonth: period, periodText: label,
    total: res.total, byProperty: res.byProperty, invoiceCount: res.invoiceCount,
    monthCount: res.months.length + (res.catchup ? 1 : 0),
  };
}

export async function prepareAllocation(buf: ArrayBuffer | Buffer, by?: string | null): Promise<PrepareResult> {
  try {
    const gl = parseGLExcel(buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const buffer = buf instanceof ArrayBuffer ? Buffer.from(buf) : buf;
    return await prepareStaged(gl, { fileBase64: buffer.toString("base64") }, by);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "prepare failed" };
  }
}

/** Stage allocation from a posting-report-derived GL (no Excel file). */
export async function prepareAllocationFromGl(gl: GLParseResult, by?: string | null): Promise<PrepareResult> {
  try {
    return await prepareStaged(gl, { glJson: serializeGl(gl) }, by);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "prepare failed" };
  }
}

export type SendResult = {
  ok: boolean;
  reason?: string;
  statementMonth?: string;
  periodText?: string;
  total?: number;
  byProperty?: { code: string; name: string; amount: number }[];
  finalized?: boolean;
  emailed?: boolean;
  invoiceCount?: number;
  monthCount?: number;
  sentAt?: string;
};

/**
 * Send a prepared allocation to AvidXchange. Reloads the staged pending send,
 * recomputes every month from the stashed GL against the CURRENT ledger, builds
 * the invoice PDFs, records each month's run, finalizes each month (chaining
 * carryover), and emails AP (Avid) cc the controller + Drew with a per-building
 * summary + TOTAL in the body. Marks the pending send sent.
 */
export async function sendAllocation(period: string, by?: string | null): Promise<SendResult> {
  try {
    const pending = await getPendingSend("allocated", period);
    if (pending?.sentAt) {
      return { ok: false, reason: "already-sent", statementMonth: period, sentAt: pending.sentAt, ...pendingBack(pending) };
    }

    // Reconstruct the GL to recompute the exact invoices. A posting-report send
    // carries a serialized GL (glJson). Otherwise the source of truth is the 2000
    // G&A GL currently imported on Operating Statements (so the send can't drift
    // from the on-screen review), falling back to the staged Excel snapshot.
    let gl: GLParseResult | null = null;
    if (pending?.glJson) {
      try { gl = deserializeGl(pending.glJson); } catch { /* fall through */ }
    }
    if (!gl) {
      let buf: Buffer | null = null;
      try {
        const stash = await getPendingGl();
        if (stash?.fileBase64) {
          const sbuf = Buffer.from(stash.fileBase64, "base64");
          const sgl = parseGLExcel(sbuf.buffer.slice(sbuf.byteOffset, sbuf.byteOffset + sbuf.byteLength));
          if (sgl.statementMonth === period) buf = sbuf;
        }
      } catch { /* fall back to the staged snapshot */ }
      if (!buf && pending?.fileBase64) buf = Buffer.from(pending.fileBase64, "base64");
      if (!buf) return { ok: false, reason: "not-prepared" };
      gl = parseGLExcel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    }

    let ledger = await getAllocLedger();
    const res = computeMonths(gl, ledger);
    if ("error" in res) return { ok: false, reason: res.error };

    if (res.months.length === 0 && !res.catchup) {
      // Every month finalized out-of-band since prepare, nothing new → already sent.
      await markPendingSent("allocated", period, by);
      return { ok: false, reason: "already-finalized", statementMonth: period, ...pendingBack(pending) };
    }

    // Fresh months + the supplemental catch-up (late charges to already-finalized
    // months) send together.
    const batches = [...res.months, ...(res.catchup ? [res.catchup] : [])];
    const multi = batches.length > 1;
    const nowISO = () => new Date().toISOString();
    // Build the invoice PDFs (no side effects yet — carryover is finalized only
    // AFTER a successful delivery, so a partial email failure can be retried).
    const invoices: (AvidInvoicePdf & { zipPath: string })[] = [];
    for (const m of batches) {
      invoices.push(...await buildMonthInvoices(m, multi ? `${m.supplemental ? "supplemental" : m.statementMonth}/` : ""));
    }
    const pdfCount = invoices.length;

    // Send each invoice PDF to Avid on its OWN email (no zip), and one summary to
    // the team. Retry-safe (per-invoice dedup): a retry re-sends only stragglers.
    let emailed = false;
    let delivered = false;
    let mailConfigured = true;
    try {
      const now = new Date();
      await markTaskComplete(now.getFullYear(), now.getMonth(), "m-alloc-exp", { at: now.toISOString(), source: "allocated" });
      if (await reportAlreadySent("allocated", period)) {
        delivered = true; // already fully sent on a prior run
      } else {
        // Zip of all invoice PDFs — for the team's records only (never to Avid).
        let archiveZip: Buffer | null = null;
        try {
          const zip = new JSZip();
          for (const inv of invoices) zip.file(inv.zipPath, inv.pdf);
          archiveZip = pdfCount > 0 ? await zip.generateAsync({ type: "nodebuffer" }) : null;
        } catch { /* archive is best-effort */ }
        const allRows = batches.flatMap((m) => m.rows);
        const accountCodes = [...new Set(allRows.map((r) => r.accountCode))].sort();
        const summaryBlob = buildAllocExportXlsx({
          periodText: gl.periodText || period, rows: allRows,
          propertyOrder: res.byProperty.map((b) => ({ id: b.code, name: b.name })),
          accountCodes,
        });
        const summaryXlsx = Buffer.from(await summaryBlob.arrayBuffer());
        const result = await deliverInvoicesToAvid({
          source: "allocated",
          label: "Allocated Expenses",
          period,
          invoices,
          byProperty: res.byProperty,
          total: res.total,
          teamCc: [REPORT_CC_DREW, REPORT_CC_HARRY],
          references: [{ name: `${period} - Allocated Expenses.xlsx`, content: summaryXlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
          archiveZip,
          by,
        });
        emailed = result.emailed;
        mailConfigured = result.mailConfigured;
        delivered = result.allDelivered;
        if (result.allDelivered) { await markReportSent("allocated", period, AVID_TO); }
      }
    } catch { /* best-effort */ }

    // Commit — record the run(s) + finalize carryover + mark sent — ONLY once
    // everything's delivered. A partial send, OR mail not being configured,
    // leaves the month OPEN so the invoice can actually reach Avid on a retry.
    // (Committing when nothing was emailed would advance the carryover baseline
    // and silently suppress re-billing on the next import — a lost invoice. This
    // matches every other Avid send path, which no-ops on mail-not-configured.)
    const commit = delivered;
    let finalized = false;
    if (commit) {
      let led = ledger;
      // Fresh months: record the run + finalize carryover (chaining holds).
      for (const m of res.months) {
        try {
          await recordAllocationRun({
            periodText: m.gl.periodText, periodEndDate: m.gl.periodEndDate, statementMonth: m.statementMonth,
            ranAt: nowISO(), ranBy: by ?? "Sent to Avid", byProperty: m.byProperty, total: m.total,
          });
        } catch { /* best-effort */ }
        try { led = finalizeMonth(led, m.statementMonth, m.expenses, nowISO()).ledger; finalized = true; } catch { /* best-effort */ }
      }
      // Supplemental catch-up: record it + apply its held effect (no re-commit of
      // the source month).
      if (res.catchup) {
        try {
          await recordAllocationRun({
            periodText: res.catchup.gl.periodText, periodEndDate: res.catchup.gl.periodEndDate, statementMonth: res.catchup.statementMonth,
            ranAt: nowISO(), ranBy: by ? `${by} (catch-up)` : "Sent to Avid (catch-up)", byProperty: res.catchup.byProperty, total: res.catchup.total,
          });
        } catch { /* best-effort */ }
        try { led = applyCatchupToLedger(led, res.catchup.expenses, res.catchup.statementMonth, nowISO()).ledger; finalized = true; } catch { /* best-effort */ }
      }
      // Persist the recognized baselines for EVERY month this GL touched (fresh,
      // legacy-backfilled, and catch-up), so a later re-import bills only new deltas.
      try { led = applyRecognized(led, res.recognizedUpdates, nowISO()); } catch { /* best-effort */ }
      try { await saveAllocLedger(led); } catch { /* best-effort */ }
      try { await markPendingSent("allocated", period, by); } catch { /* best-effort */ }
    }

    const sentAt = new Date().toISOString();
    if (!commit) {
      return {
        ok: false, reason: mailConfigured ? "partial-send" : "mail-not-configured",
        statementMonth: period, periodText: gl.periodText,
        total: res.total, byProperty: res.byProperty, emailed,
        invoiceCount: pdfCount, monthCount: batches.length,
      };
    }
    return {
      ok: true, statementMonth: period, periodText: gl.periodText,
      total: res.total, byProperty: res.byProperty, finalized, emailed,
      invoiceCount: pdfCount, monthCount: batches.length, sentAt,
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "send failed" };
  }
}

function pendingBack(p: { summary: { byProperty: { code: string; name: string; amount: number }[]; total: number; invoiceCount: number } }) {
  return { total: p.summary.total, byProperty: p.summary.byProperty, invoiceCount: p.summary.invoiceCount };
}
