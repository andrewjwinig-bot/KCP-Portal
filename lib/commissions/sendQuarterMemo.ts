// Quarter-end email of the Incentive Compensation memo (top sheet) + GL import
// files to the office, so payroll/accounting always get them without anyone
// remembering to download and forward. One memo PDF and one JE .xlsx per fund.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { canonicalQuarter, parseQuarterLabel, quarterShortCode, type CommissionEntry } from "@/lib/commissions";
import { sentRecordFor } from "./sendQuarterToAvidBill";
import { buildCommissionMemoPdf, FUND_PROPERTY_CODE } from "@/lib/commissions/memoPdf";
import { buildJournalEntryXlsx, JE_FUNDS } from "@/lib/commissions/journalEntryExcel";
import { isMailConfigured, sendMail, type MailAttachment } from "@/lib/mail";
import { buildRetailMemoPdf, RETAIL_PAYEE } from "@/lib/commissions/retailMemoPdf";

const PREFIX = "commissions";
const OFFICE_ID = "entries";
const RETAIL_ID = "entries-retail";
const SENT_ID = "korman-memo-sent";
const BATCH_ID = "je-batch";

/** Where the quarter-end memo + GL import files go. */
export const KORMAN_MEMO_TO = "mjaster@kormancommercial.com";

type SentLog = Record<string, { sentAt: string; funds: string[]; attachments: number; count?: number }>;

export type MemoSendResult = {
  ok: boolean;
  quarterLabel: string;
  funds: string[];
  attachments: number;
  alreadySent?: boolean;
  reason?: string;
};

/** Server-side batch counter for the JE files (localStorage isn't available). */
async function nextBatchNumber(): Promise<number> {
  const cur = await getJSON(PREFIX, BATCH_ID);
  const base = cur && Number.isFinite(cur.n) ? cur.n : 97338;
  const n = base + 1;
  await storeJSON(PREFIX, BATCH_ID, { n });
  return n;
}

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function emailBody(code: string, funds: string[], count: number, subtotal: number): string {
  return [
    `Attached are the ${code} Incentive Compensation memo (top sheet) and GL import files for this quarter's leasing commissions. Page 2 of each memo is the control sheet: every invoice sent to AvidXchange, to check off against Avid.`,
    "",
    `Funds:               ${funds.join(", ") || "—"}`,
    `Commissions:         ${count}`,
    `Incentive subtotal:  $${money(subtotal)}`,
    "",
    "The memo PDFs are the payroll request; the JE .xlsx files are the GL import (they post to 1940-8501).",
    "",
    "— Korman Commercial Properties",
  ].join("\n");
}

/** Build + email the quarter's memo + GL files. Idempotent per quarter (a sent
 *  log guards reruns unless `force`). `dryRun` builds attachments but doesn't
 *  send or record. */
export async function sendQuarterMemoToKorman(opts: { quarterLabel: string; dryRun?: boolean; force?: boolean; kind?: "office" | "retail" }): Promise<MemoSendResult> {
  if (opts.kind === "retail") return sendRetailMemoToKorman(opts);
  const { dryRun = false, force = false } = opts;
  const quarterLabel = canonicalQuarter(opts.quarterLabel);
  const parsed = parseQuarterLabel(quarterLabel);
  if (!parsed) return { ok: false, quarterLabel, funds: [], attachments: 0, reason: "Unparseable quarter" };

  const sentLog: SentLog = (await getJSON(PREFIX, SENT_ID)) ?? {};
  const prior = sentRecordFor(sentLog, quarterLabel);
  if (!force && prior) {
    return { ok: true, quarterLabel, funds: prior.funds, attachments: prior.attachments, alreadySent: true };
  }

  const office: CommissionEntry[] = (await getJSON(PREFIX, OFFICE_ID)) ?? [];
  const inQuarter = office.filter((e) => {
    const p = parseQuarterLabel(e.quarter);
    return !!p && p.quarter === parsed.quarter && p.year === parsed.year;
  });
  if (inQuarter.length === 0) return { ok: false, quarterLabel, funds: [], attachments: 0, reason: "No commissions for quarter" };

  const code = quarterShortCode(parsed.quarter, parsed.year);
  const attachments: MailAttachment[] = [];
  const funds: string[] = [];
  for (const fund of JE_FUNDS) {
    const pdfBytes = await buildCommissionMemoPdf({ quarter: quarterLabel, entries: inQuarter, parsed, fund });
    const xlsx = buildJournalEntryXlsx({ entries: inQuarter, fund, parsed, batchNumber: await nextBatchNumber(), uniqueId: 1_000_000 + (Date.now() % 9_000_000) });
    if (!pdfBytes && !xlsx) continue; // no entries for this fund this quarter
    funds.push(fund);
    if (pdfBytes) attachments.push({ name: `Commissions ${code} - ${FUND_PROPERTY_CODE[fund]} - Nancy L Fox.pdf`, content: pdfBytes, contentType: "application/pdf" });
    if (xlsx) attachments.push({ name: xlsx.filename, content: xlsx.buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  if (attachments.length === 0) return { ok: false, quarterLabel, funds: [], attachments: 0, reason: "Nothing to attach" };

  if (dryRun) return { ok: true, quarterLabel, funds, attachments: attachments.length };
  if (!isMailConfigured()) return { ok: false, quarterLabel, funds, attachments: attachments.length, reason: "Mail not configured" };

  const subtotal = inQuarter.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);
  const sent = await sendMail({
    to: KORMAN_MEMO_TO,
    subject: `Korman Commercial — ${code} Leasing Commissions (memo + GL import)`,
    textBody: emailBody(code, funds, inQuarter.length, subtotal),
    attachments,
  });
  if (!sent) return { ok: false, quarterLabel, funds, attachments: attachments.length, reason: "Send failed" };

  sentLog[quarterLabel] = { sentAt: new Date().toISOString(), funds, attachments: attachments.length };
  await storeJSON(PREFIX, SENT_ID, sentLog);
  return { ok: true, quarterLabel, funds, attachments: attachments.length };
}

/** The Shopping Centers (Harry's) memo to Marie — the payroll request for the
 *  retail commissions, once they are at Avid. Logged under "<quarter>::retail"
 *  so it is separate from the office memo. (No retail GL import exists yet.) */
async function sendRetailMemoToKorman(opts: { quarterLabel: string; dryRun?: boolean; force?: boolean }): Promise<MemoSendResult> {
  const quarterLabel = canonicalQuarter(opts.quarterLabel);
  const parsed = parseQuarterLabel(quarterLabel);
  if (!parsed) return { ok: false, quarterLabel, funds: [], attachments: 0, reason: "Unparseable quarter" };
  const key = `${quarterLabel}::retail`;
  const sentLog: SentLog = (await getJSON(PREFIX, SENT_ID)) ?? {};
  const retail: CommissionEntry[] = (await getJSON(PREFIX, RETAIL_ID)) ?? [];
  const inQuarter = retail.filter((e) => canonicalQuarter(e.quarter) === quarterLabel);
  // Harry's go to Avid one at a time, so a commission can land after the memo
  // went: a memo covering a different count goes again, updated.
  if (!opts.force && sentLog[key] && sentLog[key].count === inQuarter.length) return { ok: true, quarterLabel, funds: ["Shopping Centers"], attachments: 1, alreadySent: true };
  if (inQuarter.length === 0) return { ok: false, quarterLabel, funds: [], attachments: 0, reason: "No retail commissions for quarter" };
  const code = quarterShortCode(parsed.quarter, parsed.year);
  const pdf = await buildRetailMemoPdf({ entries: inQuarter, parsed });
  const attachments: MailAttachment[] = [{ name: `Retail Commissions ${code} - ${RETAIL_PAYEE}.pdf`, content: pdf, contentType: "application/pdf" }];
  if (opts.dryRun) return { ok: true, quarterLabel, funds: ["Shopping Centers"], attachments: 1 };
  if (!isMailConfigured()) return { ok: false, quarterLabel, funds: [], attachments: 1, reason: "Mail not configured" };
  const subtotal = inQuarter.reduce((s, e) => s + (Number(e.incentiveAmount) || 0), 0);
  const sent = await sendMail({
    to: KORMAN_MEMO_TO,
    subject: `Korman Commercial — ${code} Retail Leasing Commissions (memo)`,
    textBody: [
      `Attached is the ${code} Shopping Centers leasing commission memo — the payroll request for ${RETAIL_PAYEE} — with its control sheet (page 2): every invoice sent to AvidXchange, to check off against Avid.${sentLog[key] ? " This replaces the earlier memo: a commission was added." : ""}`,
      "",
      `Commissions:  ${inQuarter.length}`,
      `Commission:   $${money(subtotal)}`,
      "",
      "Charge to 1940-8501, vendor LIKM4.",
      "",
      "— Korman Commercial Properties",
    ].join("\n"),
    attachments,
  });
  if (!sent) return { ok: false, quarterLabel, funds: [], attachments: 1, reason: "Send failed" };
  sentLog[key] = { sentAt: new Date().toISOString(), funds: ["Shopping Centers"], attachments: 1, count: inQuarter.length };
  await storeJSON(PREFIX, SENT_ID, sentLog);
  return { ok: true, quarterLabel, funds: ["Shopping Centers"], attachments: 1 };
}
