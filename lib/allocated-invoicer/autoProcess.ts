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
import { parseGLExcel, type GLParseResult, type GLTransaction, type GLAccountTotal } from "./glParser";
import { ALLOC_PCT, PROPERTY_DEFS } from "@/lib/properties/data";
import {
  CARRYOVER_THRESHOLD,
  isYearEndMonth,
  baseAccountCode,
  finalizeMonth,
  type MonthExpense,
  type CarryoverLedger,
} from "./carryover";
import { getAllocLedger, saveAllocLedger } from "./carryoverStore";
import { recordAllocationRun } from "./runStore";
import { buildAllocExportXlsx, type AllocExportRow } from "./export";
import { buildAllocInvoicePdf, makeAllocInvoiceId, type AllocLineItem } from "./invoice";
import JSZip from "jszip";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { reportAlreadySent, markReportSent } from "@/lib/invoicing/reportSent";
import { markTaskComplete } from "@/lib/tracker/completionStore";
import {
  savePendingSend,
  getPendingSend,
  markPendingSent,
} from "./pendingSendStore";
import { getPendingGl } from "./pendingGlStore";

// Invoices go to AP (Avid) for processing, cc the controller + Drew.
const AVID_TO = "kormancommercial@avidbill.com";
const REPORT_CC_MARIE = "mjaster@kormancommercial.com";
const REPORT_CC_DREW = "dwinig@kormancommercial.com";
const REPORT_FROM = "dwinig@kormancommercial.com"; // verified sender

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function money(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  /** Months already finalized (skipped for idempotency). */
  skipped: string[];
  /** Combined per-building totals across `months`. */
  byProperty: { code: string; name: string; amount: number }[];
  total: number;
  /** Total invoices across all months (one per billing property per month). */
  invoiceCount: number;
};

/**
 * Compute every month a GL covers, chaining carryover through a working copy of
 * the ledger so a range's later months see the earlier months' held balances.
 * Months already in committedPeriods are skipped. Pure — mutates nothing.
 */
export function computeMonths(gl: GLParseResult, ledger: CarryoverLedger): MonthsResult | { error: string } {
  const parts = splitIntoMonths(gl);
  if (!parts.length) return { error: "no-statement-month" };

  let working = ledger;
  const months: ComputedAllocation[] = [];
  const skipped: string[] = [];
  const nowISO = new Date().toISOString();
  for (const part of parts) {
    if (!/^\d{4}-\d{2}$/.test(part.statementMonth)) return { error: "no-statement-month" };
    if (working.committedPeriods.includes(part.statementMonth)) { skipped.push(part.statementMonth); continue; }
    const c = computeOneMonth(part, working);
    if ("error" in c) return { error: c.error };
    months.push(c);
    // Advance the working ledger in memory so the next month sees these holds.
    working = finalizeMonth(working, part.statementMonth, c.expenses, nowISO).ledger;
  }

  const map = new Map<string, { code: string; name: string; amount: number }>();
  let invoiceCount = 0;
  for (const m of months) {
    invoiceCount += m.byProperty.length;
    for (const b of m.byProperty) {
      const cur = map.get(b.code) ?? { code: b.code, name: b.name, amount: 0 };
      cur.amount = round2(cur.amount + b.amount);
      map.set(b.code, cur);
    }
  }
  const byProperty = [...map.values()].filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = round2(byProperty.reduce((s, x) => s + x.amount, 0));
  return { months, skipped, byProperty, total, invoiceCount };
}

// Add one month's per-property invoice PDFs to a zip (optionally under a
// per-month folder for a range batch). Returns how many PDFs were added.
async function addMonthInvoices(zip: JSZip, c: ComputedAllocation, prefix: string): Promise<number> {
  const { gl, statementMonth, decByProp } = c;
  const invDate = gl.periodEndDate || new Date().toISOString().slice(0, 10);
  let count = 0;
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
      zip.file(`${prefix}${statementMonth} - ${id} - ${propName(id)}.pdf`, Buffer.from(await pdf.arrayBuffer()));
      count++;
    } catch { /* skip a bad PDF, keep the rest */ }
  }
  return count;
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
export async function prepareAllocation(buf: ArrayBuffer | Buffer, by?: string | null): Promise<PrepareResult> {
  try {
    const ledger = await getAllocLedger();
    const gl = parseGLExcel(buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const res = computeMonths(gl, ledger);
    if ("error" in res) return { ok: false, reason: res.error };

    const period = gl.statementMonth; // "YYYY-MM" or "YYYY-MM_to_YYYY-MM"
    if (!period) return { ok: false, reason: "no-statement-month" };

    const existing = await getPendingSend("allocated", period);
    if (existing?.sentAt) return { ok: false, reason: "already-sent", statementMonth: period, alreadySent: true };

    // Every month this GL covers is already finalized → nothing to send.
    if (res.months.length === 0) {
      return { ok: false, reason: "already-finalized", statementMonth: period, alreadySent: true };
    }

    const buffer = buf instanceof ArrayBuffer ? Buffer.from(buf) : buf;
    await savePendingSend({
      source: "allocated",
      period,
      label: gl.periodText || period,
      summary: { byProperty: res.byProperty, total: res.total, invoiceCount: res.invoiceCount },
      fileBase64: buffer.toString("base64"),
      preparedAt: new Date().toISOString(),
      preparedBy: by ?? null,
    });

    return {
      ok: true, staged: true,
      statementMonth: period, periodText: gl.periodText,
      total: res.total, byProperty: res.byProperty, invoiceCount: res.invoiceCount,
      monthCount: res.months.length,
    };
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

    // Source of truth = the 2000 G&A GL currently imported on Operating
    // Statements (the exact file the invoicer is showing), so the send can never
    // diverge from the on-screen review. Fall back to the staged snapshot only
    // if the stash is missing or is a different month.
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

    let ledger = await getAllocLedger();
    const gl = parseGLExcel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const res = computeMonths(gl, ledger);
    if ("error" in res) return { ok: false, reason: res.error };

    if (res.months.length === 0) {
      // Every month finalized out-of-band since prepare — treat as already sent.
      await markPendingSent("allocated", period, by);
      return { ok: false, reason: "already-finalized", statementMonth: period, ...pendingBack(pending) };
    }

    const multi = res.months.length > 1;
    const zip = new JSZip();
    let pdfCount = 0;
    const nowISO = () => new Date().toISOString();
    for (const m of res.months) {
      pdfCount += await addMonthInvoices(zip, m, multi ? `${m.statementMonth}/` : "");
      try {
        await recordAllocationRun({
          periodText: m.gl.periodText, periodEndDate: m.gl.periodEndDate, statementMonth: m.statementMonth,
          ranAt: nowISO(), ranBy: by ?? "Sent to Avid", byProperty: m.byProperty, total: m.total,
        });
      } catch { /* best-effort */ }
      // Finalize this month against the running ledger (persisted, chaining).
      try {
        const next = finalizeMonth(ledger, m.statementMonth, m.expenses, nowISO()).ledger;
        await saveAllocLedger(next);
        ledger = next;
      } catch { /* best-effort */ }
    }
    const invoicesZip = pdfCount > 0 ? await zip.generateAsync({ type: "nodebuffer" }) : null;

    // Email the invoice PDFs to AP (Avid), cc the controller + Drew, with a
    // combined per-building summary + TOTAL in the body. Deduped per period.
    let emailed = false;
    try {
      const now = new Date();
      await markTaskComplete(now.getFullYear(), now.getMonth(), "m-alloc-exp", { at: now.toISOString(), source: "allocated" });
      if (isMailConfigured() && !(await reportAlreadySent("allocated", period))) {
        const allRows = res.months.flatMap((m) => m.rows);
        const accountCodes = [...new Set(allRows.map((r) => r.accountCode))].sort();
        const summaryBlob = buildAllocExportXlsx({
          periodText: gl.periodText || period, rows: allRows,
          propertyOrder: res.byProperty.map((b) => ({ id: b.code, name: b.name })),
          accountCodes,
        });
        const summaryXlsx = Buffer.from(await summaryBlob.arrayBuffer());
        const bp = res.byProperty;
        const nameW = Math.max(0, ...bp.map((b) => `${b.code} — ${b.name}`.length));
        const amtW = Math.max(...bp.map((b) => money(b.amount).length), money(res.total).length);
        const rowLine = (label: string, amt: string) => `  ${label.padEnd(nameW)}   ${amt.padStart(amtW)}`;
        const summaryBody = bp.map((b) => rowLine(`${b.code} — ${b.name}`, money(b.amount))).join("\n");
        const monthsCovered = res.months.map((m) => m.statementMonth).join(", ");
        const attachments: { name: string; content: Buffer; contentType: string }[] = [
          { name: `${period} - Allocated Expenses.xlsx`, content: summaryXlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        ];
        if (invoicesZip) attachments.unshift({ name: `${period} - Allocated Invoices.zip`, content: invoicesZip, contentType: "application/zip" });
        const ok = await sendMail({
          to: AVID_TO, cc: [REPORT_CC_MARIE, REPORT_CC_DREW].join(", "), from: REPORT_FROM,
          subject: `Allocated Expenses — ${period}`,
          textBody:
            `Attached are the allocated-expense invoices (${pdfCount} invoice${pdfCount === 1 ? "" : "s"})` +
            ` and the summary workbook, reviewed and released${by ? ` by ${by}` : ""} from the 2000 G&A GL.\n\n` +
            (multi ? `Covers ${res.months.length} months: ${monthsCovered}.\n\n` : "") +
            `Allocation by building${multi ? " (all months)" : ""}:\n${summaryBody}\n` +
            `  ${"TOTAL".padEnd(nameW)}   ${money(res.total).padStart(amtW)}\n\n` +
            `Carryover has been finalized for ${multi ? "these periods" : "this period"}.\n\n` +
            `— KCP Portal`,
          attachments,
        });
        if (ok) { await markReportSent("allocated", period, AVID_TO); emailed = true; }
      }
    } catch { /* best-effort */ }

    const sentAt = new Date().toISOString();
    try { await markPendingSent("allocated", period, by); } catch { /* best-effort */ }

    return {
      ok: true, statementMonth: period, periodText: gl.periodText,
      total: res.total, byProperty: res.byProperty, finalized: true, emailed,
      invoiceCount: pdfCount, monthCount: res.months.length, sentAt,
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "send failed" };
  }
}

function pendingBack(p: { summary: { byProperty: { code: string; name: string; amount: number }[]; total: number; invoiceCount: number } }) {
  return { total: p.summary.total, byProperty: p.summary.byProperty, invoiceCount: p.summary.invoiceCount };
}
