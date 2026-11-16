// When Harry imports the credit-card statement, each cardholder who codes
// their own charges is emailed the list (owner, 11/2026: "email greg to let
// him know to code his charges and then itemize his charges … he has to know
// that theyre ready to be coded"). Pure: the route sends it.

import { portalEmail } from "@/lib/email/portalEmail";
import { cardholderOf, type Cardholder, type Tx } from "./coding";

/** Who is emailed, and where. Greg codes on his own page; add a cardholder here
 *  to email them too (Drew codes his on the dashboard). */
export const NOTIFY_CARDHOLDERS: Partial<Record<Cardholder, { to: string; name: string; path: string }>> = {
  greg: { to: (process.env.CC_CODING_GREG_TO ?? "gmasciantonio@kormancommercial.com").trim(), name: "Greg", path: "/expenses/mine" },
};

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function shortDate(s: string) {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s + "T00:00:00" : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** The charges on `who`'s card in this import (positive amounts only). */
export function chargesFor(who: Cardholder, tx: Tx[]): Tx[] {
  return tx.filter((t) => Number(t.amount) > 0 && cardholderOf(t.cardMember) === who);
}

export function codingNoticeEmail(who: Cardholder, charges: Tx[], period: string, importedBy: string | null) {
  const n = NOTIFY_CARDHOLDERS[who]!;
  const total = charges.reduce((a, t) => a + Number(t.amount), 0);
  const sorted = [...charges].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return portalEmail({
    subject: `${charges.length} credit card charge${charges.length === 1 ? "" : "s"} to code${period ? ` · ${period}` : ""}`,
    eyebrow: "Credit Card",
    title: "Your charges are ready to code",
    figure: { value: money(total), label: `${charges.length} charge${charges.length === 1 ? "" : "s"}` },
    lead: `${n.name}, the credit card statement${period ? ` for ${period}` : ""} is in. Pick the property and category for each charge below. Tick CAM for anything tenants should pay for and attach its receipt. The batch goes to AvidXchange once every charge is coded.`,
    rows: [],
    table: {
      columns: ["Date", "Charge", "Amount"],
      align: ["left", "left", "right"],
      rows: sorted.map((t) => [shortDate(t.date), String(t.description || "Charge").trim(), money(Number(t.amount))]),
      total: ["", "Total", money(total)],
    },
    link: { label: "Code my charges", path: n.path },
    footer: importedBy ? `Statement imported by ${importedBy}` : undefined,
  });
}
