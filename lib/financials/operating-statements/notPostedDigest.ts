// The words of the "not posted to the GL" digest — pure, so it is tested
// without mail or storage. One email for the whole import: a lead sentence
// with the totals, then each property (biggest expected dollars first) with
// its lines under it.

import type { NotPostedItem } from "./notPosted";

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

export function composeNotPostedDigest(entries: StagedNotPosted[]): { subject: string; text: string; lines: number } {
  const props = [...entries].sort((a, b) => sumOf(b.items) - sumOf(a.items) || a.propertyName.localeCompare(b.propertyName));
  const lines = props.reduce((n, e) => n + e.items.length, 0);
  const total = props.reduce((s, e) => s + sumOf(e.items), 0);
  const period = periodLabel(props);
  // Names arrive as stored ("drew", "DREW") — Title Case them for the mail.
  const title = (n: string) => n.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const who = [...new Set(props.map((e) => e.importedBy).filter(Boolean).map((n) => title(n as string)))];

  const subject =
    `Not posted to the GL — ${lines} line${lines === 1 ? "" : "s"}` +
    (props.length > 1 ? ` across ${props.length} properties` : ` · ${props[0]?.propertyName ?? ""}`) +
    (period ? ` · ${period}` : "");

  const labelW = Math.max(24, ...props.flatMap((e) => e.items.map((i) => `${i.section} · ${i.line}`.length)));
  const blocks = props.map((e) => {
    const months = [...new Set(e.items.map((i) => i.monthLabel))].join(", ");
    const head = `${e.propertyName} — ${months} ${e.year} · ${money0(sumOf(e.items))}`;
    const rows = [...e.items]
      .sort((a, b) => b.expected - a.expected)
      .map((i) => `  ${`${i.section} · ${i.line}`.padEnd(labelW)}   ${money0(i.expected).padStart(12)}${i.type === "missing-debt" ? "  (debt service)" : ""}`);
    return [head, ...rows].join("\n");
  });

  const text = [
    `${lines} line${lines === 1 ? " is" : "s are"} still not posted to the GL across ${props.length} propert${props.length === 1 ? "y" : "ies"} — ${money0(total)} expected in all` +
      (who.length ? `, from the General Ledger just imported by ${who.join(" and ")}.` : "."),
    "",
    ...blocks.flatMap((b) => [b, ""]),
    "These are budgeted or scheduled figures still reading $0 — real estate taxes, insurance, the management fee and debt service. Post them, or confirm they don't apply for the month. Flags to Investigate in the portal lists them all.",
    "",
    "— KCP Portal",
  ].join("\n");

  return { subject, text, lines };
}
