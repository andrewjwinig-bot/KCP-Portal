// Harry's retail commissions go to AvidXchange THE MOMENT HE SAVES ONE (owner:
// "harrys commissions should automatically be sent to avid when he hits add
// entry … still send marie the excel entry. after every commission is sent
// to Avid, email harry the … $ amount (before the 20% markup) so he can put
// it on the payroll"). Per entry, in order:
//   1. the invoice to Avid — one PDF, its own email, billed × 1.2
//      (`sendQuarterToAvidBill` with `onlyIds`, so the ledger and the history
//      record it like any other);
//   2. the GL import (.xlsx) for that one commission to Marie;
//   3. Harry the commission before markup, for payroll.
// Each step is logged, so a retry finishes what failed and never repeats.

import "server-only";
import * as XLSX from "xlsx";
import { getJSON, storeJSON } from "@/lib/storage";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { canonicalQuarter, formatShortDate, parseQuarterLabel, quarterShortCode, type CommissionEntry } from "@/lib/commissions";
import { commissionInvoiceNumber } from "@/lib/pdf/renderCommissionInvoicePdf";
import { deliveredEntryIds, quarterInvoiceRows, sendQuarterToAvidBill } from "./sendQuarterToAvidBill";
import { KORMAN_MEMO_TO } from "./sendQuarterMemo";

const PREFIX = "commissions";
const RETAIL_ID = "entries-retail";
const LOG_ID = "retail-entry-log";
const BATCH_ID = "je-batch";
const MARKUP = 1.2;

/** Who is told the payroll figure. `RETAIL_COMMISSION_PAYEE_TO` overrides it. */
export function retailPayeeEmail(): string {
  return (process.env.RETAIL_COMMISSION_PAYEE_TO ?? "").trim() || "hfeldman@kormancommercial.com";
}

type EntryLog = Record<string, { avidAt?: string; marieAt?: string; harryAt?: string }>;

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function nextBatchNumber(): Promise<number> {
  const cur = await getJSON(PREFIX, BATCH_ID);
  const n = (cur && Number.isFinite(cur.n) ? cur.n : 97338) + 1;
  await storeJSON(PREFIX, BATCH_ID, { n });
  return n;
}

// A MACHINE IMPORT, not a document: the same bare BTCH / INVH / DIST rows the
// office JE carries (`buildJournalEntryRows`), no header or title — do NOT
// theme it. One commission → one DIST line to its shopping centre.
export function retailJournalEntryRows(entry: CommissionEntry, batchNumber: number, uniqueId: number): (string | number)[][] | null {
  const parsed = parseQuarterLabel(entry.quarter);
  if (!parsed) return null;
  const code = quarterShortCode(parsed.quarter, parsed.year);
  const description = `${code} InHouse Comm`;
  const building = (entry.building || "").toUpperCase();
  const gross = round2((Number(entry.incentiveAmount) || 0) * MARKUP);
  const dateStr = formatShortDate(parsed.periodEnd);
  return [
    ["BTCH", "", batchNumber, uniqueId, "", 1],
    ["INVH", description, dateStr, "", gross, `${building} ${code} Comm`, "LIKM4", dateStr, dateStr],
    ["DIST", building, "1940-8501", description, "", gross],
  ];
}

export type RetailEntrySendResult = {
  ok: boolean;
  avid: boolean;
  marie: boolean;
  harry: boolean;
  invoiceNumber?: string;
  amount?: number;
  reason?: string;
};

export async function sendRetailEntry(id: string, by: string | null): Promise<RetailEntrySendResult> {
  const entries: CommissionEntry[] = (await getJSON(PREFIX, RETAIL_ID)) ?? [];
  const entry = entries.find((e) => e.id === id);
  if (!entry) return { ok: false, avid: false, marie: false, harry: false, reason: "Commission not found" };
  const quarterLabel = canonicalQuarter(entry.quarter);
  const parsed = parseQuarterLabel(quarterLabel);
  if (!parsed) return { ok: false, avid: false, marie: false, harry: false, reason: "No quarter on the commission" };
  if (!isMailConfigured()) return { ok: false, avid: false, marie: false, harry: false, reason: "Mail not configured" };

  const log: EntryLog = ((await getJSON(PREFIX, LOG_ID)) ?? {}) as EntryLog;
  const rec = log[id] ?? {};
  const save = async () => { log[id] = rec; await storeJSON(PREFIX, LOG_ID, log); };
  const invoiceNumber = commissionInvoiceNumber({ ...entry, quarter: quarterLabel });
  const commission = round2(Number(entry.incentiveAmount) || 0);
  const code = quarterShortCode(parsed.quarter, parsed.year);

  // 1. Avid.
  if (!rec.avidAt) {
    const res = await sendQuarterToAvidBill({ quarterLabel, onlyIds: [id], kind: "retail", by });
    const rows = await quarterInvoiceRows(quarterLabel);
    const delivered = await deliveredEntryIds(quarterLabel, rows);
    if (!delivered.has(id)) return { ok: false, avid: false, marie: false, harry: false, invoiceNumber, reason: res.reason ?? "The invoice did not reach AvidXchange" };
    rec.avidAt = new Date().toISOString();
    await save();
  }

  // 2. Marie — the GL import for this commission.
  if (!rec.marieAt) {
    const rows = retailJournalEntryRows(entry, await nextBatchNumber(), 1_000_000 + (Date.now() % 9_000_000));
    if (rows) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${(entry.building || "SC").toUpperCase()} ${code}`);
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
      const ok = await sendMail({
        to: KORMAN_MEMO_TO,
        subject: `Retail Leasing Commission — ${invoiceNumber} — ${entry.tenant || "—"} (GL import)`,
        textBody: [
          `The GL import for a retail leasing commission just sent to AvidXchange.`,
          ``,
          `Invoice:     ${invoiceNumber}`,
          `Tenant:      ${entry.tenant || "—"}`,
          `Property:    ${entry.building || "—"}  Suite ${entry.suite || "—"}`,
          `Billed:      ${money(commission * MARKUP)} (commission ${money(commission)} + 20%)`,
          `Coding:      1940-8501, vendor LIKM4`,
          ``,
          `— Korman Commercial Properties`,
        ].join("\n"),
        attachments: [{
          name: `JE_Retail_${safe(invoiceNumber)}.xlsx`, content: buffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }],
      });
      if (ok) { rec.marieAt = new Date().toISOString(); await save(); }
    }
  }

  // 3. Harry — the commission before markup, for payroll.
  if (!rec.harryAt) {
    const ok = await sendMail({
      to: retailPayeeEmail(),
      subject: `Commission sent to AvidXchange — ${entry.tenant || "—"}: ${money(commission)} for payroll`,
      textBody: [
        `Hello Harry,`,
        ``,
        `Your commission for ${entry.tenant || "—"} (${entry.building || "—"} Suite ${entry.suite || "—"}) has been sent to AvidXchange as invoice ${invoiceNumber}.`,
        ``,
        `For payroll: ${money(commission)} (before the 20% markup).`,
        ``,
        `— KCP Portal`,
      ].join("\n"),
    });
    if (ok) { rec.harryAt = new Date().toISOString(); await save(); }
  }

  return {
    ok: !!(rec.avidAt && rec.marieAt && rec.harryAt),
    avid: !!rec.avidAt, marie: !!rec.marieAt, harry: !!rec.harryAt,
    invoiceNumber, amount: commission,
    ...(rec.marieAt && rec.harryAt ? {} : { reason: `Sent to AvidXchange; ${[!rec.marieAt && "Marie's GL import", !rec.harryAt && "Harry's payroll email"].filter(Boolean).join(" and ")} did not go — Send again to finish` }),
  };
}

function safe(s: string): string {
  return s.replace(/[^a-z0-9\-_. ]/gi, "_").trim();
}
