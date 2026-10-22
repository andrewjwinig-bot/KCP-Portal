// WHAT SEPTEMBER 2026 ACTUALLY BILLED (owner, 10/20/26: "i think its showing
// the charges from prior months that got lumped in"). Each September invoice
// is September's own charges PLUS any balance held under $100 that crossed it
// in September ("incl. $X carried forward" on the PDF). The 10/19 import ran
// Oct–Nov 2025 just before September, so part of what it carried into
// September came from months billed in 2025 — billed twice.
//
// Read from the PDFs AS SENT (the archive) and the 10/19 GL: per account, the
// carried amount (the PDF's note) and how much of it the 2025 months put there
// — at most what those months allocated to that account. Read-only.

import "server-only";
import { listPendingSends } from "./pendingSendStore";
import { getInvoiceArchive } from "./invoiceArchive";
import { computeOneMonth, loadSendGl, splitIntoMonths } from "./autoProcess";
import { pdfText } from "@/lib/pdf/pdfText";
import { PROPERTY_DEFS } from "@/lib/properties/data";

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const money = (s: string) => Number(s.replace(/[$,]/g, ""));

/** Each account's carried-forward note on one invoice, from its text: a note
 *  belongs to the last "NNNN-8501" total above it. Pure. */
export function carriedFromText(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  let base: string | null = null;
  const re = /(\d{4})-8501|incl\.\s*\$?\s*([\d,]+\.\d{2})\s*carried forward/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[1]) base = m[1];
    else if (base) out[base] = round2((out[base] ?? 0) + money(m[2]));
  }
  return out;
}

/** How much of a carried amount came from 2025: the 2025 holds were the last
 *  added before September, so at most what 2025 allocated, never more than
 *  the carry. Pure. */
export function from2025Portion(carried: number, allocated2025: number): number {
  return round2(Math.max(0, Math.min(carried, allocated2025)));
}

export type SeptAccount = { code: string; name: string; carried: number; from2025: number };
export type SeptRow = { code: string; name: string; billed: number; carried: number; from2025: number; september: number; accounts: SeptAccount[] };
export type SeptCheck = { rows: SeptRow[]; billed: number; carried: number; from2025: number; september: number; invoices: number } | { error: string };

export async function septemberCheck(): Promise<SeptCheck> {
  const pending = (await listPendingSends()).find((p) => p.source === "allocated" && p.sentAt?.startsWith("2026-10-19"));
  if (!pending) return { error: "The 10/19 send is not on record." };
  const [archive, gl] = await Promise.all([getInvoiceArchive(pending.period), loadSendGl(pending.period, pending)]);
  if (!archive?.invoices.length) return { error: "September's invoices are not in the archive." };
  if (!gl) return { error: "The GL behind the 10/19 send is no longer on file." };

  // What the 2025 months allocated to each property / account.
  const alloc2025 = new Map<string, number>();
  const names = new Map<string, string>();
  for (const part of splitIntoMonths(gl).filter((p) => p.statementMonth < "2026-01")) {
    const c = computeOneMonth(part, { balances: {}, committedPeriods: [], updatedAt: "" });
    if ("error" in c) continue;
    for (const e of c.expenses) {
      const k = `${e.propertyId}|${e.accountCode}`;
      alloc2025.set(k, round2((alloc2025.get(k) ?? 0) + e.amount));
      names.set(e.accountCode, e.accountName);
    }
  }

  const billedBy = new Map((pending.summary?.byProperty ?? []).map((b) => [b.code, b.amount]));
  const rows: SeptRow[] = [];
  for (const inv of archive.invoices) {
    const code = (inv.propertyLabel.match(/^(\S+)/)?.[1] ?? "").trim();
    let text = "";
    try { text = await pdfText(Buffer.from(inv.pdfBase64, "base64")); } catch { /* unreadable → no carry */ }
    const carried = carriedFromText(text);
    const accounts = Object.entries(carried).map(([base, amt]) => ({
      code: base, name: names.get(base) ?? "", carried: amt,
      from2025: from2025Portion(amt, alloc2025.get(`${code}|${base}`) ?? 0),
    })).sort((a, b) => b.carried - a.carried);
    const billed = round2(billedBy.get(code) ?? 0);
    const c = round2(accounts.reduce((s, a) => s + a.carried, 0));
    const f = round2(accounts.reduce((s, a) => s + a.from2025, 0));
    rows.push({ code, name: PROPERTY_DEFS.find((p) => p.id === code)?.name ?? code, billed, carried: c, from2025: f, september: round2(billed - c), accounts });
  }
  rows.sort((a, b) => b.billed - a.billed);
  const sum = (f: (r: SeptRow) => number) => round2(rows.reduce((s, r) => s + f(r), 0));
  return { rows, billed: sum((r) => r.billed), carried: sum((r) => r.carried), from2025: sum((r) => r.from2025), september: sum((r) => r.september), invoices: rows.length };
}
