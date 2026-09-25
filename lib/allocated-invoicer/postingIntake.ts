// Bridge a Skyline A/P (or GL) posting report into the Allocated Expense
// Invoicer. A posting report to property 2000 carries the just-posted G&A
// invoices; its allocated accounts (suffix 9301/9302/9303) are exactly what the
// invoicer allocates across the buildings. This converts that property's posted
// lines into the invoicer's GLParseResult so a supplemental A/P report flows
// straight into pending allocated invoices — without re-exporting the full GL.
//
// The recognized-amount ledger reconciles this against the eventual full 2000
// GL, so a charge billed off the posting report is NOT billed again when the
// full GL lands (and vice-versa) — no double-count, nothing skipped.

import "server-only";
import type { GLParseResult, GLTransaction, GLAccountTotal } from "./glParser";
import type { PostingProperty } from "@/lib/financials/operating-statements/postingReport";

const ALLOC_SUFFIXES = new Set(["9301", "9302", "9303"]);

/** "M/D/YYYY" → "YYYY-MM", or null. */
function monthKeyOf(date: string): string | null {
  const m = String(date || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const yyyy = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${yyyy}-${m[1].padStart(2, "0")}`;
}
function lastDayOfMonth(ym: string): string {
  const [y, mo] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`;
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

/** Build an allocated-invoicer GLParseResult from a 2000 posting property's
 *  allocated-account lines. Returns null when the property has no allocated
 *  activity. A multi-month report becomes a range GL (the invoicer splits it by
 *  transaction date). */
export function glFromPosting(prop: PostingProperty, names?: Record<string, string>): GLParseResult | null {
  const transactions: GLTransaction[] = [];
  for (const [account, txs] of Object.entries(prop.transactions)) {
    const suffix = account.split("-")[1];
    if (!ALLOC_SUFFIXES.has(suffix)) continue;
    for (const t of txs) {
      transactions.push({
        accountCode: account,
        accountSuffix: suffix as "9301" | "9302" | "9303",
        accountName: names?.[account] || account,
        date: t.date,
        description: t.description || "",
        jrn: "",
        ref: t.ref || "",
        debit: t.amount > 0 ? t.amount : 0,
        credit: t.amount < 0 ? -t.amount : 0,
        net: t.amount,
      });
    }
  }
  if (!transactions.length) return null;

  const months = [...new Set(transactions.map((t) => monthKeyOf(t.date)).filter((k): k is string => !!k))].sort();
  if (!months.length) return null;

  const accountTotals = new Map<string, GLAccountTotal>();
  for (const t of transactions) {
    const e = accountTotals.get(t.accountCode);
    if (e) e.netTotal += t.net;
    else accountTotals.set(t.accountCode, { accountCode: t.accountCode, accountName: t.accountName, accountSuffix: t.accountSuffix, netTotal: t.net });
  }

  const statementMonth = months.length === 1 ? months[0] : `${months[0]}_to_${months[months.length - 1]}`;
  const periodText = months.length === 1 ? `${monthLabel(months[0])} (posting report)` : `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])} (posting report)`;
  return { statementMonth, periodText, periodEndDate: lastDayOfMonth(months[months.length - 1]), transactions, accountTotals };
}
