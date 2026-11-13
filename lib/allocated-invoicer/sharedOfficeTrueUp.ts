// THE 2026 SHARED OFFICE TRUE-UP — which months ride on November's invoices
// (`sharedOffice.ts` says how). Decided ONCE, the first time a GL covering
// November is computed, and kept (`alloc-repairs/shared-office-trueup-2026`),
// so every later read of November lays in the same months:
//   • January – September always;
//   • October too when October's Allocated Expenses went out WITHOUT the
//     shared office (sent before it existed — read off the October PDFs
//     archived since it went live). October still to send bills its own.

import "server-only";
import { getJSON, listJSON, storeJSON } from "@/lib/storage";
import { pdfText } from "@/lib/pdf/pdfText";
import { getAllocLedger } from "./carryoverStore";
import type { InvoiceArchive } from "./invoiceArchive";
import { SHARED_OFFICE_FROM, TRUEUP_INTO } from "./sharedOffice";

const MARK_PREFIX = "alloc-repairs";
const MARK_ID = "shared-office-trueup-2026";
/** Month-by-month billing went live 11/13/26 — no archive before it can carry the shared office. */
const LIVE_SINCE = "2026-11-13";

export type TrueUpPlan = { intoMonth: string; months: string[]; decidedAt: string };

async function octoberAlreadyBilled(): Promise<boolean> {
  const archives = (await listJSON("alloc-invoice-archive").catch(() => [])) as InvoiceArchive[];
  for (const a of archives) {
    if (!a?.sentAt || a.sentAt < LIVE_SINCE || a.reconstructed) continue;
    for (const inv of a.invoices ?? []) {
      try {
        const t = await pdfText(Buffer.from(inv.pdfBase64, "base64"));
        if (t.includes("Shared Leasing") && /October\s+2026/.test(t)) return true;
      } catch { /* an unreadable PDF proves nothing */ }
    }
  }
  return false;
}

/** The true-up's months — decided and stored the first time it is asked. */
export async function trueUpPlan(): Promise<TrueUpPlan> {
  const saved = (await getJSON(MARK_PREFIX, MARK_ID).catch(() => null)) as TrueUpPlan | null;
  if (saved?.months?.length) return saved;
  const year = Number(TRUEUP_INTO.slice(0, 4));
  const from = Number(SHARED_OFFICE_FROM.slice(5, 7));
  const months: string[] = [];
  for (let m = 1; m < from; m++) months.push(`${year}-${String(m).padStart(2, "0")}`);
  const ledger = await getAllocLedger();
  if (ledger.committedPeriods.includes(SHARED_OFFICE_FROM) && !(await octoberAlreadyBilled())) months.push(SHARED_OFFICE_FROM);
  const plan: TrueUpPlan = { intoMonth: TRUEUP_INTO, months, decidedAt: new Date().toISOString() };
  await storeJSON(MARK_PREFIX, MARK_ID, plan);
  return plan;
}
