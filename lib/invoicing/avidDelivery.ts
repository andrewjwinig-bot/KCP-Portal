// Shared delivery to AvidXchange for every invoicer (Allocated, Credit Card,
// Payroll). AvidXchange CANNOT open a ZIP and ingests ONE invoice per email, so
// each invoice PDF is sent as its OWN email with a single PDF attachment — never
// a zip, never several invoices in one message. The cc'd team (controller + Drew
// + optionally Harry) get ONE separate summary email instead of being copied on
// every invoice; that email carries the per-building summary and the internal
// xlsx references (and may include the full zip, which is fine for them since
// only Avid can't open it).

import "server-only";
import { sendMail, isMailConfigured } from "@/lib/mail";

const AVID_TO = "kormancommercial@avidbill.com";
const REPORT_FROM = "dwinig@kormancommercial.com"; // verified Postmark sender
const CONTROLLER = "mjaster@kormancommercial.com"; // Marie

const PDF = "application/pdf";

export type AvidInvoicePdf = {
  /** Human label for the property/payee, e.g. "4500 — Grays Ferry". */
  propertyLabel: string;
  /** Attachment filename, e.g. "2026-07 - 4500 - Grays Ferry.pdf". */
  fileName: string;
  pdf: Buffer;
};
export type AvidReference = { name: string; content: Buffer; contentType: string };

function money(n: number): string {
  return "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type DeliverResult = { avidSent: number; invoiceCount: number; teamNotified: boolean; emailed: boolean; mailConfigured: boolean };

export async function deliverInvoicesToAvid(opts: {
  /** "Allocated Expenses" | "Credit Card Expenses" | "Payroll". */
  label: string;
  period: string;
  invoices: AvidInvoicePdf[];
  byProperty: { code: string; name: string; amount: number }[];
  total: number;
  /** People cc'd on the team summary besides the controller (e.g. Drew, Harry). */
  teamCc: string[];
  /** Internal xlsx references for the team summary (never sent to Avid). */
  references?: AvidReference[];
  /** Zip of all invoice PDFs for the team's records only (Avid never receives it). */
  archiveZip?: Buffer | null;
  /** Payroll: reassure the figures are property-level only. */
  privacyNote?: boolean;
  by?: string | null;
}): Promise<DeliverResult> {
  const invoiceCount = opts.invoices.length;
  if (!isMailConfigured()) {
    return { avidSent: 0, invoiceCount, teamNotified: false, emailed: false, mailConfigured: false };
  }

  // 1) One email per invoice PDF → Avid (no zip, no cc).
  let avidSent = 0;
  for (const inv of opts.invoices) {
    const ok = await sendMail({
      to: AVID_TO,
      from: REPORT_FROM,
      subject: `${opts.label} — ${inv.propertyLabel} — ${opts.period}`,
      textBody: `Attached is the ${opts.period} ${opts.label.toLowerCase()} invoice for ${inv.propertyLabel}.\n\n— KCP Portal`,
      attachments: [{ name: inv.fileName, content: inv.pdf, contentType: PDF }],
    });
    if (ok) avidSent++;
  }

  // 2) One summary email → the team (their record; NOT sent to Avid).
  const bp = opts.byProperty;
  const nameW = Math.max(0, ...bp.map((b) => `${b.code} — ${b.name}`.length));
  const amtW = Math.max(money(opts.total).length, ...bp.map((b) => money(b.amount).length));
  const rowLine = (l: string, a: string) => `  ${l.padEnd(nameW)}   ${a.padStart(amtW)}`;
  const summaryBody = bp.length
    ? bp.map((b) => rowLine(`${b.code} — ${b.name}`, money(b.amount))).join("\n") + `\n  ${"TOTAL".padEnd(nameW)}   ${money(opts.total).padStart(amtW)}`
    : "  (no property detail)";
  const teamAttachments = [...(opts.references ?? [])];
  if (opts.archiveZip) teamAttachments.push({ name: `${opts.period} - ${opts.label} Invoices.zip`, content: opts.archiveZip, contentType: "application/zip" });
  const cc = opts.teamCc.filter((x) => x && x !== CONTROLLER).join(", ");

  const teamOk = await sendMail({
    to: CONTROLLER,
    ...(cc ? { cc } : {}),
    from: REPORT_FROM,
    subject: `${opts.label} sent to AvidXchange — ${opts.period}`,
    textBody:
      `${avidSent}${avidSent === invoiceCount ? "" : ` of ${invoiceCount}`} ${opts.label.toLowerCase()} invoice${invoiceCount === 1 ? "" : "s"} ` +
      `${opts.by ? `released by ${opts.by} ` : ""}to AvidXchange for ${opts.period} — sent as one email per invoice (Avid can't take a zip).\n\n` +
      `Allocation by building:\n${summaryBody}\n\n` +
      `${opts.privacyNote ? "These figures are property-level only — no employee payroll detail is included.\n\n" : ""}` +
      `— KCP Portal`,
    attachments: teamAttachments.map((a) => ({ name: a.name, content: a.content, contentType: a.contentType })),
  });

  return { avidSent, invoiceCount, teamNotified: teamOk, emailed: avidSent > 0 || teamOk, mailConfigured: true };
}
