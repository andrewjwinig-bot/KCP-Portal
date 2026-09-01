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
//     from the stashed GL (so nothing drifts), builds the per-property invoice
//     PDFs, records the run, finalizes the month (the single carryover
//     mutation), and emails the invoices + summary to AP (Avid) cc the
//     controller + Drew. Marks the pending send sent (idempotent).
//
// Idempotent by month: a month already finalized/sent is skipped, so
// re-importing the same GL never double-processes.

import "server-only";
import { parseGLExcel, type GLParseResult } from "./glParser";
import { ALLOC_PCT, PROPERTY_DEFS } from "@/lib/properties/data";
import {
  CARRYOVER_THRESHOLD,
  isYearEndMonth,
  baseAccountCode,
  finalizeMonth,
  type MonthExpense,
} from "./carryover";
import { getAllocLedger, saveAllocLedger } from "./carryoverStore";
import { type CarryoverLedger } from "./carryover";
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

/**
 * Pure allocation compute — allocate each 9301/9302/9303 account across its
 * properties, decorate with carryover against the given ledger, and roll up the
 * per-building billing totals. No side effects (no finalize, no email, no
 * stash). Shared by prepare (summary/stage) and send (recompute).
 */
function computeAllocation(buf: ArrayBuffer | Buffer, ledger: CarryoverLedger): ComputedAllocation | { error: string } {
  const gl = parseGLExcel(
    buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  const statementMonth = gl.statementMonth;
  if (!/^\d{4}-\d{2}$/.test(statementMonth)) {
    return { error: "no-statement-month" };
  }

  const propIds = Object.keys(ALLOC_PCT);

  // 1) Allocation rows — each account × property share by suffix.
  const rows: AllocExportRow[] = [];
  for (const acc of gl.accountTotals.values()) {
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

  // 2) Carryover decoration — this month + prior held per base account, keeping
  //    each account's suffix rows so the per-property invoice PDFs can be built.
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

  const billingTotals = new Map<string, number>(); // billed accrued per property
  const expenses: MonthExpense[] = [];             // this-month figures for finalize
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
    // Prior-held accounts with no activity this month — bill only at year-end.
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

  return { gl, statementMonth, rows, decByProp, byProperty, total, expenses };
}

// Build the per-property invoice PDFs from the finalized allocation data (so
// they can never drift from what was allocated) and zip them.
async function buildInvoicesZip(c: ComputedAllocation): Promise<{ zip: Buffer | null; count: number }> {
  const { gl, statementMonth, decByProp } = c;
  const invDate = gl.periodEndDate || new Date().toISOString().slice(0, 10);
  const zip = new JSZip();
  let pdfCount = 0;
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
      zip.file(`${statementMonth} - ${id} - ${propName(id)}.pdf`, Buffer.from(await pdf.arrayBuffer()));
      pdfCount++;
    } catch { /* skip a bad PDF, keep the rest */ }
  }
  const invoicesZip = pdfCount > 0 ? await zip.generateAsync({ type: "nodebuffer" }) : null;
  return { zip: invoicesZip, count: pdfCount };
}

export type PrepareResult = {
  ok: boolean;
  reason?: string;
  statementMonth?: string;
  periodText?: string;
  total?: number; // total that will bill this run
  byProperty?: { code: string; name: string; amount: number }[];
  invoiceCount?: number;
  /** Staged for review — awaiting a "Send to AvidXchange" click. */
  staged?: boolean;
  /** This period was already sent to Avid (idempotent). */
  alreadySent?: boolean;
};

/**
 * Prepare a 2000 G&A GL: compute the allocation + per-building summary and stage
 * a pending send (stashing the GL so the send recomputes the identical
 * invoices). Does NOT finalize carryover and does NOT email — it only readies
 * the invoices and waits for a reviewer. `by` is the importing user.
 * Never throws (best-effort — the import must still succeed).
 */
export async function prepareAllocation(buf: ArrayBuffer | Buffer, by?: string | null): Promise<PrepareResult> {
  try {
    const ledger = await getAllocLedger();
    const c = computeAllocation(buf, ledger);
    if ("error" in c) return { ok: false, reason: c.error };
    const { statementMonth, byProperty, total, gl } = c;

    // Already finalized this month → it was already sent; don't re-stage.
    if (ledger.committedPeriods.includes(statementMonth)) {
      return { ok: false, reason: "already-finalized", statementMonth, alreadySent: true };
    }

    // If a pending send for this period was already sent, keep it sent.
    const existing = await getPendingSend("allocated", statementMonth);
    if (existing?.sentAt) {
      return { ok: false, reason: "already-sent", statementMonth, alreadySent: true };
    }

    const buffer = buf instanceof ArrayBuffer ? Buffer.from(buf) : buf;
    await savePendingSend({
      source: "allocated",
      period: statementMonth,
      label: gl.periodText || statementMonth,
      summary: { byProperty, total, invoiceCount: byProperty.length },
      fileBase64: buffer.toString("base64"),
      preparedAt: new Date().toISOString(),
      preparedBy: by ?? null,
    });

    return {
      ok: true, staged: true,
      statementMonth, periodText: gl.periodText,
      total, byProperty, invoiceCount: byProperty.length,
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
  sentAt?: string;
};

/**
 * Send a prepared allocation to AvidXchange. Reloads the staged pending send,
 * recomputes the invoices from the stashed GL, builds the PDFs, records the run,
 * finalizes carryover, and emails AP (Avid) cc the controller + Drew with a
 * per-building summary + TOTAL in the body. Marks the pending send sent so a
 * second click never re-sends. `by` is the reviewer who approved the send.
 */
export async function sendAllocation(period: string, by?: string | null): Promise<SendResult> {
  try {
    const pending = await getPendingSend("allocated", period);
    if (!pending) return { ok: false, reason: "not-prepared" };
    if (pending.sentAt) {
      return { ok: false, reason: "already-sent", statementMonth: period, sentAt: pending.sentAt, ...pendingBack(pending) };
    }

    const buf = Buffer.from(pending.fileBase64, "base64");
    const ledger = await getAllocLedger();
    if (ledger.committedPeriods.includes(period)) {
      // Finalized out-of-band — treat as already sent.
      await markPendingSent("allocated", period, by);
      return { ok: false, reason: "already-finalized", statementMonth: period, ...pendingBack(pending) };
    }

    const c = computeAllocation(buf, ledger);
    if ("error" in c) return { ok: false, reason: c.error };
    const { statementMonth, byProperty, total, rows, expenses, gl } = c;

    // Build the invoice PDFs from this same finalized data.
    const { zip: invoicesZip, count: pdfCount } = await buildInvoicesZip(c);

    // Record the run (history + per-building breakdown).
    try {
      await recordAllocationRun({
        periodText: gl.periodText, periodEndDate: gl.periodEndDate, statementMonth,
        ranAt: new Date().toISOString(), ranBy: by ?? "Sent to Avid", byProperty, total,
      });
    } catch { /* best-effort */ }

    // Finalize the month — the single carryover mutation.
    let finalized = false;
    try {
      const { ledger: next } = finalizeMonth(ledger, statementMonth, expenses, new Date().toISOString());
      await saveAllocLedger(next);
      finalized = true;
    } catch { /* best-effort */ }

    // Email the invoice PDFs to AP (Avid), cc the controller + Drew, with a
    // per-building summary + TOTAL in the body. Deduped per period.
    let emailed = false;
    try {
      const now = new Date();
      await markTaskComplete(now.getFullYear(), now.getMonth(), "m-alloc-exp", { at: now.toISOString(), source: "allocated" });
      if (isMailConfigured() && !(await reportAlreadySent("allocated", period))) {
        const accountCodes = [...new Set(rows.map((r) => r.accountCode))].sort();
        const summaryBlob = buildAllocExportXlsx({
          periodText: gl.periodText, rows,
          propertyOrder: byProperty.map((b) => ({ id: b.code, name: b.name })),
          accountCodes,
        });
        const summaryXlsx = Buffer.from(await summaryBlob.arrayBuffer());
        const nameW = Math.max(0, ...byProperty.map((b) => `${b.code} — ${b.name}`.length));
        const amtW = Math.max(...byProperty.map((b) => money(b.amount).length), money(total).length);
        const rowLine = (label: string, amt: string) => `  ${label.padEnd(nameW)}   ${amt.padStart(amtW)}`;
        const summaryBody = byProperty.map((b) => rowLine(`${b.code} — ${b.name}`, money(b.amount))).join("\n");
        const attachments: { name: string; content: Buffer; contentType: string }[] = [
          { name: `${period} - Allocated Expenses.xlsx`, content: summaryXlsx, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        ];
        if (invoicesZip) attachments.unshift({ name: `${period} - Allocated Invoices.zip`, content: invoicesZip, contentType: "application/zip" });
        const ok = await sendMail({
          to: AVID_TO, cc: [REPORT_CC_MARIE, REPORT_CC_DREW].join(", "), from: REPORT_FROM,
          subject: `Allocated Expenses — ${period}`,
          textBody:
            `Attached are the ${period} allocated-expense invoices (${pdfCount} propert${pdfCount === 1 ? "y" : "ies"})` +
            ` and the summary workbook, reviewed and released${by ? ` by ${by}` : ""} from the 2000 G&A GL.\n\n` +
            `Allocation by building:\n${summaryBody}\n` +
            `  ${"TOTAL".padEnd(nameW)}   ${money(total).padStart(amtW)}\n\n` +
            `${finalized ? "Carryover has been finalized for this period.\n\n" : ""}` +
            `— KCP Portal`,
          attachments,
        });
        if (ok) { await markReportSent("allocated", period, AVID_TO); emailed = true; }
      }
    } catch { /* best-effort */ }

    // Mark the pending send sent (keeps it for the audit trail).
    const sentAt = new Date().toISOString();
    try { await markPendingSent("allocated", period, by); } catch { /* best-effort */ }

    return { ok: true, statementMonth, periodText: gl.periodText, total, byProperty, finalized, emailed, invoiceCount: pdfCount, sentAt };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "send failed" };
  }
}

function pendingBack(p: { summary: { byProperty: { code: string; name: string; amount: number }[]; total: number; invoiceCount: number } }) {
  return { total: p.summary.total, byProperty: p.summary.byProperty, invoiceCount: p.summary.invoiceCount };
}
