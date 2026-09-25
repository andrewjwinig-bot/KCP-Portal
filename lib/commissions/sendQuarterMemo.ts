// Quarter-end email of the Incentive Compensation memo (top sheet) + GL import
// files to the office, so payroll/accounting always get them without anyone
// remembering to download and forward. One memo PDF and one JE .xlsx per fund.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { parseQuarterLabel, quarterShortCode, type CommissionEntry } from "@/lib/commissions";
import { buildCommissionMemoPdf } from "@/lib/commissions/memoPdf";
import { buildJournalEntryXlsx, JE_FUNDS } from "@/lib/commissions/journalEntryExcel";
import { isMailConfigured, sendMail, type MailAttachment } from "@/lib/mail";

const PREFIX = "commissions";
const OFFICE_ID = "entries";
const SENT_ID = "korman-memo-sent";
const BATCH_ID = "je-batch";

/** Where the quarter-end memo + GL import files go. */
export const KORMAN_MEMO_TO = "mjaster@kormancommercial.com";

type SentLog = Record<string, { sentAt: string; funds: string[]; attachments: number }>;

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
    `Attached are the ${code} Incentive Compensation memo (top sheet) and GL import files for this quarter's leasing commissions.`,
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
export async function sendQuarterMemoToKorman(opts: { quarterLabel: string; dryRun?: boolean; force?: boolean }): Promise<MemoSendResult> {
  const { quarterLabel, dryRun = false, force = false } = opts;
  const parsed = parseQuarterLabel(quarterLabel);
  if (!parsed) return { ok: false, quarterLabel, funds: [], attachments: 0, reason: "Unparseable quarter" };

  const sentLog: SentLog = (await getJSON(PREFIX, SENT_ID)) ?? {};
  if (!force && sentLog[quarterLabel]) {
    return { ok: true, quarterLabel, funds: sentLog[quarterLabel].funds, attachments: sentLog[quarterLabel].attachments, alreadySent: true };
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
    if (pdfBytes) attachments.push({ name: `Commissions ${code} - ${fund} - Nancy L Fox.pdf`, content: pdfBytes, contentType: "application/pdf" });
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
