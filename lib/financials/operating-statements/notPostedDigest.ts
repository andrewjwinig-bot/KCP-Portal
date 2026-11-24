// The words of the "not posted to the GL" digest — pure, so it is tested
// without mail or storage. One email for the whole import: a lead sentence
// with the totals, then each property (biggest expected dollars first) with
// its lines under it.

import type { NotPostedItem } from "./notPosted";
import { portalEmail, titleCase } from "@/lib/email/portalEmail";

export type StagedNotPosted = {
  id: string;
  key: string;
  propertyName: string;
  year: number;
  items: NotPostedItem[];
  sig: string;
  importedBy: string | null;
  stagedAt: string;
};

function money0(n: number): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
}

const sumOf = (items: NotPostedItem[]) => items.reduce((s, i) => s + (Number(i.expected) || 0), 0);

/** "October 2026", or "September – October 2026" when the batch spans months. */
function periodLabel(entries: StagedNotPosted[]): string {
  const months = new Map<string, number>(); // label → sort key
  for (const e of entries) for (const i of e.items) {
    const label = `${i.monthLabel} ${e.year}`;
    months.set(label, e.year * 100 + i.period);
  }
  const sorted = [...months.entries()].sort((a, b) => a[1] - b[1]).map(([l]) => l);
  if (sorted.length <= 1) return sorted[0] ?? "";
  return `${sorted[0]} – ${sorted[sorted.length - 1]}`;
}

export function composeNotPostedDigest(entries: StagedNotPosted[]): { subject: string; text: string; html: string; lines: number } {
  const props = [...entries].sort((a, b) => sumOf(b.items) - sumOf(a.items) || a.propertyName.localeCompare(b.propertyName));
  const lines = props.reduce((n, e) => n + e.items.length, 0);
  const total = props.reduce((s, e) => s + sumOf(e.items), 0);
  const period = periodLabel(props);
  const who = [...new Set(props.map((e) => e.importedBy).filter(Boolean).map((n) => titleCase(n as string)))];

  const subject =
    `Not posted to the GL — ${lines} line${lines === 1 ? "" : "s"}` +
    (props.length > 1 ? ` across ${props.length} properties` : ` · ${props[0]?.propertyName ?? ""}`) +
    (period ? ` · ${period}` : "");

  // The portal's look (owner, 11/2026): the total big, then a section per
  // property — each line linked to its month on the statement.
  const mail = portalEmail({
    subject,
    eyebrow: "Not Posted to the GL",
    title: `${lines} line${lines === 1 ? "" : "s"} still reading $0`,
    lead: `${props.length > 1 ? `Across ${props.length} properties` : props[0]?.propertyName ?? ""}${period ? `, ${period}` : ""}${who.length ? ` · General Ledger imported by ${who.join(" and ")}` : ""}`,
    figure: { value: money0(total), label: "Expected, not yet posted" },
    rows: [],
    sections: props.map((e) => {
      const months = [...new Set(e.items.map((i) => i.monthLabel.slice(0, 3)))].join(", ");
      return {
        title: e.propertyName,
        // The month only when the batch spans months — the lead already says it.
        count: period.includes("–") ? `${money0(sumOf(e.items))} · ${months}` : money0(sumOf(e.items)),
        items: [...e.items].sort((a, b) => b.expected - a.expected).map((i) => ({
          title: i.line,
          sub: i.type === "missing-debt" ? "Scheduled loan payment" : undefined,
          meta: money0(i.expected),
          path: `/financials/operating-statements?key=${encodeURIComponent(e.key)}&year=${e.year}&period=${i.period}`,
        })),
      };
    }),
    note: { label: "What to do", text: "Post each one, or dismiss it on the statement if it doesn't apply this month." },
    link: { label: "Open Flags to Investigate", path: "/financials/operating-statements/review" },
  });

  return { subject, text: mail.text, html: mail.html, lines };
}
