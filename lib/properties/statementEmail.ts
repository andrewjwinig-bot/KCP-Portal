// The Statement of Values email to an investor — in the K-1 emails' look
// (owner, 11/2026: "lets see statement of values done next"), so the same
// investor gets the same-looking mail from us whatever it carries. Pure; the
// send route attaches the PDF.
//
// It is ADDRESSED to whoever it goes to (owner: "i dont always send them to
// the investor themselves i sometimes send to their admin or accountant"):
// greeted by that person's name, and when it is not the investor the
// statement is named as the INVESTOR'S, never "your" — the K-1 emails' rule.

import { shell } from "@/lib/maintenance/confirmationEmail";
import { greeting } from "@/lib/investors/k1ShareEmail";

export type StatementEmailInput = {
  /** The investor whose statement it is. */
  investor: string;
  /** Who the email is addressed to — the investor, or their admin /
   *  accountant. Blank = the investor. */
  addressedTo?: string;
  asOfYearEnd: string;
  asOfEstimate?: string;
  /** Kept for callers; NOT printed — the figure stays in the attached PDF
   *  (owner: "i dont think we should include the equity value in the email
   *  itself"). */
  totalEquity?: number;
};

/** "CAROLYN JACOBS" → "Carolyn Jacobs"; a name already in mixed case is kept. */
const proper = (s: string) =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;

const words = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 1);
/** The same person: equal names, or the same first and last word. */
export function samePerson(a: string, b: string): boolean {
  const x = words(a), y = words(b);
  if (!x.length || !y.length) return false;
  return x.join(" ") === y.join(" ") || (x[0] === y[0] && x[x.length - 1] === y[y.length - 1]);
}

export function statementEmail(i: StatementEmailInput): { subject: string; html: string; text: string; onBehalf: boolean } {
  const investor = proper(i.investor.trim());
  const to = proper((i.addressedTo ?? "").trim()) || investor;
  const onBehalf = !samePerson(to, investor);
  const their = onBehalf ? `${investor}'s` : "your";
  const Their = onBehalf ? `${investor}'s` : "Your";
  const subject = `Korman Commercial — ${Their} Statement of Values (${i.asOfYearEnd})`;
  const hello = greeting([to]);
  const html = shell({
    propertyCode: null, kormanLogo: true,
    subject,
    eyebrow: "Statement of Values",
    hello: hello.replace(/,$/, "."),
    accent: `${Their} statement is ready.`,
    sub: `${Their} interests as of ${i.asOfYearEnd}, attached as a PDF.`,
    details: [
      ...(onBehalf ? [["Investor", investor] as [string, string]] : []),
      ["As of", i.asOfYearEnd],
      ...(i.asOfEstimate ? [["Estimate as of", i.asOfEstimate] as [string, string]] : []),
    ],
    boxLabel: "", boxText: "", emergency: false,
    footNote: `The attached statement lists each partnership and ${their} share of it. Questions? Just reply to this email.`,
  });
  const text = [
    hello,
    "",
    `Attached is ${their} Statement of Values as of ${i.asOfYearEnd}${i.asOfEstimate ? ` (with an estimated value as of ${i.asOfEstimate})` : ""}.`,
    "",
    "Questions? Just reply to this email.",
    "",
    "Korman Commercial Properties",
  ].join("\n");
  return { subject, html, text, onBehalf };
}
