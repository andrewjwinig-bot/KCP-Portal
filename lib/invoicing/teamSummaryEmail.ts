// The TEAM SUMMARY after a batch reaches AvidXchange — Marie's (cc Drew /
// Harry) record of what billed, ONE email for every flow (Allocated Expenses,
// Credit Card, Payroll, Commissions), laid out exactly like Tanya's AP
// register (owner, 11/2026: "same setup … just swap the info … basically the
// same process just different data"). It was plain text with space-padded
// columns, which no proportional mail font lines up. Pure, for the preview.

import { portalEmail } from "@/lib/email/portalEmail";

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function teamSummaryEmail(o: {
  label: string;
  periodLabel: string;
  sent: number;
  invoiceCount: number;
  byProperty: { code: string; name: string; amount: number }[];
  total: number;
  by?: string | null;
  /** Payroll: say the figures carry no employee detail. */
  privacyNote?: boolean;
  /** File names attached (the GL import, the allocation workbook…). */
  attached: string[];
}) {
  const n = o.invoiceCount;
  const count = o.sent === n ? `${n} invoice${n === 1 ? "" : "s"}` : `${o.sent} of ${n} invoices`;
  return portalEmail({
    subject: `${o.label} sent to AvidXchange — ${o.periodLabel}`,
    eyebrow: "Sent to AvidXchange",
    title: o.label,
    lead: `${o.periodLabel} · ${count}${o.by ? ` released by ${o.by}` : ""}, each sent as its own email to AvidXchange.`,
    figure: { value: money(o.total), label: "Total billed" },
    rows: [],
    table: {
      columns: ["Property", "Amount"],
      rows: o.byProperty.map((b) => [`${b.code} ${b.name}`.trim(), plain(b.amount)]),
      total: ["Total", plain(o.total)],
      align: ["left", "right"],
      ...(o.privacyNote ? { note: "Property-level figures only — no employee payroll detail." } : {}),
    },
    footer: o.attached.length ? `Attached: ${o.attached.join(", ")}` : "",
  });
}
