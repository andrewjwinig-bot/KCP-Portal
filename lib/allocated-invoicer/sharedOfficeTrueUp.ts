// THE 2026 SHARED OFFICE TRUE-UP (owner, 11/2026: "when i posted november can
// you true up the year to date reimbursement for the office rent and
// electric … then itll be month by month after that").
//
// Month-by-month billing starts at SHARED_OFFICE_FROM (October 2026). This
// bills the months of 2026 before it ONCE, as one invoice per property:
//   • January – September always;
//   • October too, when October's Allocated Expenses went out WITHOUT the
//     shared office (sent before it existed) — read off the October PDFs as
//     sent. October still to send picks it up itself.
// It waits for 2010's November GL (the owner's trigger), runs on the 2010
// import and the daily Allocated cron, bills every property in full (a year's
// catch-up is not held under $100), and goes through the same AvidXchange
// delivery — one PDF per email, the team summary to Drew and Harry. Sent
// once: `alloc-repairs/shared-office-trueup-2026` records it. When October is
// billed here, its recognized baseline takes the amount too, so a later
// year-to-date 2000 import never true-ups October's shared office again.

import "server-only";
import { getJSON, listJSON, storeJSON } from "@/lib/storage";
import { assembledGl } from "@/lib/financials/operating-statements/statementStore";
import { findRentRollUnit } from "@/lib/rentroll/current";
import { pdfText } from "@/lib/pdf/pdfText";
import { deliverInvoicesToAvid } from "@/lib/invoicing/avidDelivery";
import { reportAlreadySent, markReportSent } from "@/lib/invoicing/reportSent";
import { buildMonthInvoices, computeOneMonth } from "./autoProcess";
import { applyRecognized, baseAccountCode, emptyLedger, isMonthBaselined, recognizedFor, type RecognizedUpdate } from "./carryover";
import { getAllocLedger, saveAllocLedger } from "./carryoverStore";
import { saveInvoiceArchive, type InvoiceArchive } from "./invoiceArchive";
import { officeRentalFor } from "./sharedOfficeLoad";
import {
  LIK_OFFICE_UNIT, SHARED_OFFICE_FROM, SHARED_OFFICE_NAME, TRUEUP_AFTER_MONTH, TRUEUP_YEAR,
  trueUpGl, trueUpInvoiceId, trueUpLabel, type SharedOfficeMonth,
} from "./sharedOffice";

const MARK_PREFIX = "alloc-repairs";
const MARK_ID = `shared-office-trueup-${TRUEUP_YEAR}`;
/** The AP send log's key — its own row in the Monthly History. */
export const TRUEUP_PERIOD = `shared-office-ytd-${TRUEUP_YEAR}`;
const AVID_TO = "kormancommercial@avidbill.com";
const TEAM_CC = ["dwinig@kormancommercial.com", "hfeldman@kormancommercial.com"];
/** Month-by-month billing went live 11/13/26 — no archive before it can carry the shared office. */
const LIVE_SINCE = "2026-11-13";

export type TrueUpMark = { sentAt: string; sentBy: string | null; months: string[]; total: number; invoiceCount: number; byProperty: { code: string; name: string; amount: number }[] };
export type TrueUpResult =
  | { status: "sent"; mark: TrueUpMark }
  | { status: "already-sent"; mark: TrueUpMark }
  | { status: "waiting"; reason: string }
  | { status: "failed"; reason: string };

const pad = (m: number) => String(m).padStart(2, "0");
const monthOf = (m: number) => `${TRUEUP_YEAR}-${pad(m)}`;

/** True when a PDF sent since the shared office went live already bills
 *  October's shared office (October's own send, or a late-charge catch-up). */
async function octoberAlreadyBilled(): Promise<boolean> {
  const archives = (await listJSON("alloc-invoice-archive").catch(() => [])) as InvoiceArchive[];
  for (const a of archives) {
    if (!a?.sentAt || a.sentAt < LIVE_SINCE || a.reconstructed || a.period === TRUEUP_PERIOD) continue;
    for (const inv of a.invoices ?? []) {
      try {
        const t = await pdfText(Buffer.from(inv.pdfBase64, "base64"));
        if (t.includes("Shared Leasing") && /October\s+2026/.test(t)) return true;
      } catch { /* an unreadable PDF proves nothing */ }
    }
  }
  return false;
}

export async function getTrueUpMark(): Promise<TrueUpMark | null> {
  return ((await getJSON(MARK_PREFIX, MARK_ID).catch(() => null)) as TrueUpMark | null) ?? null;
}

/** Bill the year to date once 2010's November is posted. Idempotent. */
export async function trueUpSharedOffice(by?: string | null): Promise<TrueUpResult> {
  const done = await getTrueUpMark();
  if (done) return { status: "already-sent", mark: done };

  const gl2010 = await assembledGl("2010", TRUEUP_YEAR).catch(() => null);
  const through = gl2010 ? gl2010.coverageEnd ?? gl2010.maxPeriodInFile ?? 0 : 0;
  if (through < TRUEUP_AFTER_MONTH) return { status: "waiting", reason: `2010's GL is posted through month ${through}; the true-up runs once November is in` };

  const unit = await findRentRollUnit(LIK_OFFICE_UNIT).catch(() => null);
  const officeSqft = Number(unit?.sqft) || 0;
  if (!(officeSqft > 0)) return { status: "failed", reason: `Suite ${LIK_OFFICE_UNIT} has no square feet on the rent roll` };

  const ledger = await getAllocLedger();
  const fromMonth = Number(SHARED_OFFICE_FROM.slice(5, 7));
  const wanted: number[] = [];
  for (let m = 1; m < fromMonth; m++) wanted.push(m);
  // October: billed here only if it went out without the shared office.
  const oct = SHARED_OFFICE_FROM;
  const octIncluded = ledger.committedPeriods.includes(oct) && !(await octoberAlreadyBilled());
  if (octIncluded) wanted.push(fromMonth);

  const months: SharedOfficeMonth[] = [];
  for (const m of wanted) {
    const rental = officeRentalFor(gl2010, m);
    if (rental) months.push({ month: monthOf(m), officeRental: rental, officeSqft });
  }
  const gl = trueUpGl(months);
  if (!gl) return { status: "failed", reason: "2010 shows no Office Rental for the months to true up" };

  // Every property bills in full — no $100 hold on a year's catch-up, and no
  // held balance rides along (the ledger's holds are left for their month).
  const c = computeOneMonth(gl, { ...emptyLedger(), billAllOnNextSend: true });
  if ("error" in c) return { status: "failed", reason: c.error };
  const label = trueUpLabel(months.map((m) => m.month));
  const invoices = await buildMonthInvoices(c, "", { invoiceId: (id) => trueUpInvoiceId(id), fileTag: "SHARED OFFICE TRUE-UP" });
  if (!invoices.length) return { status: "failed", reason: "no invoices to send" };

  let delivered = await reportAlreadySent("allocated", TRUEUP_PERIOD);
  if (!delivered) {
    const r = await deliverInvoicesToAvid({
      source: "allocated", label: "Allocated Expenses", period: TRUEUP_PERIOD,
      periodLabel: `${SHARED_OFFICE_NAME} — ${label} true-up`,
      invoices, byProperty: c.byProperty, total: c.total, teamCc: TEAM_CC, by,
    });
    if (!r.mailConfigured) return { status: "failed", reason: "mail is not configured" };
    if (!r.allDelivered) return { status: "failed", reason: r.inProgress ? "another send is in progress" : "not every invoice was delivered — the next run finishes it" };
    delivered = true;
    await markReportSent("allocated", TRUEUP_PERIOD, AVID_TO).catch(() => {});
  }

  const sentAt = new Date().toISOString();
  await saveInvoiceArchive({
    period: TRUEUP_PERIOD, sentAt, sentBy: by ?? null,
    invoices: invoices.map((i) => ({ fileName: i.fileName, propertyLabel: i.propertyLabel, pdfBase64: i.pdf.toString("base64") })),
  }).catch(() => {});

  // October billed here: its baseline takes the amount, so a later 2000 import
  // carrying October's shared office sees nothing new.
  if (octIncluded) {
    const octMonth = months.find((m) => m.month === oct);
    const octGl = octMonth ? trueUpGl([octMonth]) : null;
    const octC = octGl ? computeOneMonth(octGl, emptyLedger()) : null;
    if (octC && !("error" in octC)) {
      try {
        const led = await getAllocLedger();
        if (isMonthBaselined(led, oct)) {
          const add = new Map<string, number>();
          for (const r of octC.rows) {
            const k = `${r.propertyId}|${baseAccountCode(r.accountCode)}`;
            add.set(k, (add.get(k) ?? 0) + r.allocAmount);
          }
          const updates: RecognizedUpdate[] = [...add.entries()].map(([k, amt]) => {
            const [pid, base] = k.split("|");
            return { propertyId: pid, accountCode: base, statementMonth: oct, amount: recognizedFor(led, pid, base, oct) + amt };
          });
          await saveAllocLedger(applyRecognized(led, updates, sentAt));
        }
      } catch (e) { console.error("[shared-office true-up] October baseline not updated", e); }
    }
  }

  const mark: TrueUpMark = {
    sentAt, sentBy: by ?? null, months: months.map((m) => m.month),
    total: c.total, invoiceCount: invoices.length, byProperty: c.byProperty,
  };
  await storeJSON(MARK_PREFIX, MARK_ID, mark);
  return { status: "sent", mark };
}
