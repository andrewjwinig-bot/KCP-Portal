// Server-side auto-processing of the Allocated Expense Invoicer, run the moment
// a 2000 G&A GL is imported (from either the invoicer or the operating
// statements page). Mirrors the on-screen flow so no manual step is needed:
//   1. allocate each 9301/9302/9303 account across its properties (ALLOC_PCT),
//   2. decorate with carryover — this month's amount PLUS any held balance that
//      now crosses the $100 threshold bills; the rest holds (December flushes),
//   3. record the run (with per-building billed totals) for the history,
//   4. finalize the month (advance the carryover ledger — the one mutation),
//   5. email the summary workbook to the controller (deduped per period).
//
// Idempotent by month: a month already finalized is skipped, so re-importing
// the same GL never double-processes.

import "server-only";
import { parseGLExcel } from "./glParser";
import { ALLOC_PCT, PROPERTY_DEFS } from "@/lib/properties/data";
import {
  CARRYOVER_THRESHOLD,
  isYearEndMonth,
  baseAccountCode,
  finalizeMonth,
  type MonthExpense,
} from "./carryover";
import { getAllocLedger, saveAllocLedger } from "./carryoverStore";
import { recordAllocationRun } from "./runStore";
import { buildAllocExportXlsx, type AllocExportRow } from "./export";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { reportAlreadySent, markReportSent } from "@/lib/invoicing/reportSent";
import { markTaskComplete } from "@/lib/tracker/completionStore";

const REPORT_TO = "mjaster@kormancommercial.com";
const REPORT_CC = "dwinig@kormancommercial.com";
const REPORT_FROM = "dwinig@kormancommercial.com";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function money(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function propName(id: string): string {
  return PROPERTY_DEFS.find((p) => p.id === id)?.name ?? id;
}

export type AutoProcessResult = {
  ok: boolean;
  reason?: string;
  statementMonth?: string;
  periodText?: string;
  total?: number; // total billed this run
  byProperty?: { code: string; name: string; amount: number }[];
  finalized?: boolean;
  emailed?: boolean;
};

/**
 * Process a 2000 G&A GL end-to-end. `by` is the importing user (for the run log).
 * Returns a summary; never throws (best-effort — the import must still succeed).
 */
export async function autoProcessAllocation(buf: ArrayBuffer | Buffer, by?: string | null): Promise<AutoProcessResult> {
  try {
    const gl = parseGLExcel(buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const statementMonth = gl.statementMonth;
    if (!/^\d{4}-\d{2}$/.test(statementMonth)) {
      return { ok: false, reason: "no-statement-month" };
    }

    // Already finalized this month → don't re-process (idempotent).
    const ledger = await getAllocLedger();
    if (ledger.committedPeriods.includes(statementMonth)) {
      return { ok: false, reason: "already-finalized", statementMonth };
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

    // 2) Carryover decoration — this month + prior held per base account.
    const yearEnd = isYearEndMonth(statementMonth);
    // property → base account → { name, thisMonth }
    const byProp = new Map<string, Map<string, { name: string; thisMonth: number }>>();
    for (const r of rows) {
      const base = baseAccountCode(r.accountCode);
      if (!byProp.has(r.propertyId)) byProp.set(r.propertyId, new Map());
      const am = byProp.get(r.propertyId)!;
      const cur = am.get(base) ?? { name: r.accountName, thisMonth: 0 };
      cur.thisMonth = round2(cur.thisMonth + r.allocAmount);
      am.set(base, cur);
    }

    const billingTotals = new Map<string, number>(); // billed accrued per property
    const expenses: MonthExpense[] = [];             // this-month figures for finalize
    for (const id of propIds) {
      const am = byProp.get(id);
      const seen = new Set<string>();
      if (am) {
        for (const [base, g] of am) {
          seen.add(base);
          const prior = round2(ledger.balances[id]?.accounts?.[base]?.heldTotal ?? 0);
          const accrued = round2(g.thisMonth + prior);
          const billed = yearEnd || accrued >= CARRYOVER_THRESHOLD;
          if (billed) billingTotals.set(id, round2((billingTotals.get(id) ?? 0) + accrued));
          if (g.thisMonth !== 0) expenses.push({ propertyId: id, accountCode: base, accountName: g.name, amount: g.thisMonth });
        }
      }
      // Prior-held accounts with no activity this month — bill only at year-end.
      const pc = ledger.balances[id];
      if (pc) {
        for (const [base, carry] of Object.entries(pc.accounts)) {
          if (seen.has(base)) continue;
          if (yearEnd) billingTotals.set(id, round2((billingTotals.get(id) ?? 0) + round2(carry.heldTotal)));
        }
      }
    }

    const byProperty = propIds
      .map((id) => ({ code: id, name: propName(id), amount: round2(billingTotals.get(id) ?? 0) }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const total = round2(byProperty.reduce((s, x) => s + x.amount, 0));

    // 3) Record the run (history + per-building breakdown).
    try {
      await recordAllocationRun({
        periodText: gl.periodText, periodEndDate: gl.periodEndDate, statementMonth,
        ranAt: new Date().toISOString(), ranBy: by ?? "GL import", byProperty, total,
      });
    } catch { /* best-effort */ }

    // 4) Finalize the month — the single carryover mutation.
    let finalized = false;
    try {
      const { ledger: next } = finalizeMonth(ledger, statementMonth, expenses, new Date().toISOString());
      await saveAllocLedger(next);
      finalized = true;
    } catch { /* best-effort */ }

    // 5) Email the summary workbook to the controller (deduped per period).
    let emailed = false;
    try {
      const now = new Date();
      await markTaskComplete(now.getFullYear(), now.getMonth(), "m-alloc-exp", { at: now.toISOString(), source: "allocated" });
      const period = statementMonth || gl.periodEndDate || "Statement";
      if (isMailConfigured() && !(await reportAlreadySent("allocated", period))) {
        const accountCodes = [...new Set(rows.map((r) => r.accountCode))].sort();
        const blob = buildAllocExportXlsx({
          periodText: gl.periodText, rows,
          propertyOrder: byProperty.map((b) => ({ id: b.code, name: b.name })),
          accountCodes,
        });
        const content = Buffer.from(await blob.arrayBuffer());
        const ok = await sendMail({
          to: REPORT_TO, cc: REPORT_CC, from: REPORT_FROM,
          subject: `Allocated Expenses Processed — ${period}`,
          textBody:
            `Marie,\n\n` +
            `The ${period} allocated-expense invoicing run was processed automatically when the 2000 G&A GL was imported` +
            `${by ? ` by ${by}` : ""}.\n\n` +
            `Total allocated this run: ${money(total)} across ${byProperty.length} properties` +
            `${finalized ? " · carryover finalized" : ""}.\n\n` +
            `The summary workbook is attached.`,
          attachments: [{ name: `${period} - Allocated Expenses.xlsx`, content, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
        });
        if (ok) { await markReportSent("allocated", period, REPORT_TO); emailed = true; }
      }
    } catch { /* best-effort */ }

    return { ok: true, statementMonth, periodText: gl.periodText, total, byProperty, finalized, emailed };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "auto-process failed" };
  }
}
