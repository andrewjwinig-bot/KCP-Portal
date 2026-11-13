// The Statement of Values email to an investor — in the K-1 emails' look
// (owner, 11/2026: "lets see statement of values done next"), so the same
// investor gets the same-looking mail from us whatever it carries. Pure; the
// send route attaches the PDF.

import { shell } from "@/lib/maintenance/confirmationEmail";
import { greeting } from "@/lib/investors/k1ShareEmail";

export type StatementEmailInput = {
  /** Who it is addressed to (the contact's name, else the beneficiary). */
  name: string;
  asOfYearEnd: string;
  asOfEstimate?: string;
  totalEquity: number;
};

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
/** "CAROLYN JACOBS" → "Carolyn Jacobs"; a name already in mixed case is kept. */
const proper = (s: string) =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s;

export function statementEmail(i: StatementEmailInput): { subject: string; html: string; text: string } {
  const subject = `Korman Commercial — Your Statement of Values (${i.asOfYearEnd})`;
  const hello = greeting([proper(i.name)]);
  const html = shell({
    propertyCode: null, kormanLogo: true,
    subject,
    eyebrow: "Statement of Values",
    hello: hello.replace(/,$/, "."),
    accent: "Your statement is ready.",
    sub: `Your interests as of ${i.asOfYearEnd}, attached as a PDF.`,
    details: [
      ["Equity value", money(i.totalEquity)],
      ["As of", i.asOfYearEnd],
      ...(i.asOfEstimate ? [["Estimate as of", i.asOfEstimate] as [string, string]] : []),
    ],
    boxLabel: "", boxText: "", emergency: false,
    footNote: "The attached statement lists each partnership and your share of it. Questions? Just reply to this email.",
  });
  const text = [
    hello,
    "",
    `Attached is your Statement of Values as of ${i.asOfYearEnd}${i.asOfEstimate ? ` (with an estimated value as of ${i.asOfEstimate})` : ""}.`,
    "",
    `Total equity value: ${money(i.totalEquity)}`,
    "",
    "Questions? Just reply to this email.",
    "",
    "Korman Commercial Properties",
  ].join("\n");
  return { subject, html, text };
}
