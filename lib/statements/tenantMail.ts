// Mail to a tenant from Accounts Receivable — shared by the receipt email and
// the balance reminder, so both go from Tami, sign the same way and attach the
// same statement.

import "server-only";
import { jsPDF } from "jspdf";
import { drawMonthlyStatement } from "./monthlyStatementPdf";
import { instructionsFor } from "./payment";
import { getOrEmptySuiteContacts } from "@/lib/suites/contactsStorage";
import { camRecipientEmails } from "@/lib/suites/contacts";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { sendMailDetailed, VERIFIED_FROM, type MailMessage, type MailResult } from "@/lib/mail";
import type { TenantStatement } from "./types";
import { signatureFor } from "@/lib/emailSignature";

// Tami sends these and answers them (owner, 11/2026: "set it up to be from
// ttomlinson@kormancommercial.com"). RECEIPT_FROM / RECEIPT_FROM_NAME override
// without a deploy.
export const RECEIPT_FROM = (process.env.RECEIPT_FROM ?? "ttomlinson@kormancommercial.com").trim();
export const RECEIPT_FROM_NAME = (process.env.RECEIPT_FROM_NAME ?? "Tami Tomlinson").trim();

export function propertyLabel(code: string): string {
  const d = PROPERTY_DEFS.find((p) => p.id === code);
  if (!d) return code;
  return d.fundGroup ? `${d.name}, Neshaminy Interplex` : d.name;
}

export async function arSigner(propertyCode: string) {
  const ins = await instructionsFor(propertyCode);
  // `signature` is the block every one of her emails ends in (name, office,
  // phone, logo) — added at render, after the editable closing.
  return { name: RECEIPT_FROM_NAME, title: "Accounts Receivable", email: RECEIPT_FROM, phone: ins.contactPhone || undefined, signature: signatureFor(RECEIPT_FROM_NAME) };
}

export async function suiteRecipients(unitRef: string): Promise<string[]> {
  const rec = await getOrEmptySuiteContacts(unitRef.replace(/-FO$/i, ""));
  return camRecipientEmails(rec.contacts).split(";").map((s) => s.trim()).filter(Boolean);
}

/** The tenant's statement of account for the month — the same branded PDF
 *  their portal serves — naming Tami as the contact. */
export async function statementPdf(period: string, st: TenantStatement): Promise<{ name: string; content: Uint8Array; contentType: string }> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const payment = { ...(await instructionsFor(st.propertyCode)), contactName: RECEIPT_FROM_NAME, contactEmail: RECEIPT_FROM };
  drawMonthlyStatement(doc, st, { propLabel: `${st.propertyCode} — ${propertyLabel(st.propertyCode)}`, period, payment });
  const safe = (s: string) => s.replace(/[^\w]+/g, "_");
  return { name: `${safe(st.tenantName)}_${period}_Statement.pdf`, content: new Uint8Array(doc.output("arraybuffer")), contentType: "application/pdf" };
}

/** Send from Tami's own address. Postmark sends only from an address it has
 *  verified, so if hers is refused the email still goes — from the portal's
 *  verified sender, under her name, replies still to her. */
export async function sendFromAr(msg: Omit<MailMessage, "from">, sig: { name: string; email: string }): Promise<{ result: MailResult; fromHeader: string; fromUsed: string }> {
  let fromUsed = sig.email;
  let fromHeader = `${sig.name}, Korman Commercial Properties <${sig.email}>`;
  let result = await sendMailDetailed({ ...msg, from: fromHeader });
  if (!result.ok && sig.email.toLowerCase() !== VERIFIED_FROM.toLowerCase()) {
    console.warn(`[tenant-mail] sending from ${sig.email} refused (${result.error}) — retrying from ${VERIFIED_FROM}`);
    fromUsed = VERIFIED_FROM;
    fromHeader = `${sig.name}, Korman Commercial Properties <${VERIFIED_FROM}>`;
    result = await sendMailDetailed({ ...msg, from: fromHeader });
  }
  return { result, fromHeader, fromUsed };
}
