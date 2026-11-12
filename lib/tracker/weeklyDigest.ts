// The Monday digest to Drew (owner, 11/2026: "cleaned up … more useful with
// integrated html links"): the week's tasks, imports, GL uploads behind,
// lines not posted and tenants to close out, in the portal's email look
// (lib/email/portalEmail.ts), every item a link to the page that does it.
// Pure — the cron route gathers the data and sends.

import { CATEGORIES, type TaskOccurrence } from "@/lib/tracker/taskDefs";
import { completionKey } from "@/lib/tracker/completionStore";
import { importsForWeek } from "@/lib/tracker/imports";
import { reminderSatisfied, reminderOutstanding, type ImportEvent } from "@/lib/tracker/importEvents";
import type { OutstandingGl } from "@/lib/financials/operating-statements/outstanding";
import type { VacatedTenant } from "@/lib/leasing/recentlyVacated";
import type { NotPostedItem } from "@/lib/financials/operating-statements/notPosted";
import { portalEmail, titleCase, type PortalItem, type PortalSection } from "@/lib/email/portalEmail";

export function weekBounds(now: Date): { start: Date; end: Date } {
  const sinceMon = (now.getDay() + 6) % 7; // 0=Sun → week starts Monday
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMon);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59);
  return { start, end };
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function buildDigest(
  now: Date,
  tasks: TaskOccurrence[],
  completions: Record<string, unknown>,
  outstanding: { expected: { year: number; period: number }; behind: OutstandingGl[] } | null,
  vacated: VacatedTenant[],
  importEvents: Record<string, ImportEvent>,
  notPosted: NotPostedItem[],
) {
  const { start, end } = weekBounds(now);
  const money0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

  const open = tasks.filter(
    (o) => !completions[completionKey(o.date.getFullYear(), o.date.getMonth(), o.id)],
  );
  const doneCount = tasks.length - open.length;

  const range = `${fmtDate(start)} – ${fmtDate(end)}`;
  const year = now.getFullYear();
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const sections: PortalSection[] = [];

  // ── Tasks due this week — each opens its page ────────────────────────────
  sections.push({
    title: "Tasks this week",
    count: open.length ? `${open.length} open${doneCount ? ` · ${doneCount} done` : ""}` : tasks.length ? "all done" : "",
    countTone: open.length ? undefined : "good",
    items: open.map((o) => ({ title: o.label, meta: fmtDate(o.date), sub: CATEGORIES[o.category]?.label, path: o.link ?? "/tracker" })),
    empty: tasks.length ? `All ${tasks.length} done.` : "Nothing scheduled.",
  });

  // ── Files to import (Drew's only — the CC statement and payroll are Harry's) ─
  const imports = importsForWeek(start, end).filter((r) => (r.owner ?? "drew") === "drew");
  // Not-yet-due is not outstanding: the AP report covers bills paid on
  // Wednesday, so it cannot be missing on a Monday.
  const outstandingImports = imports.filter((r) => reminderOutstanding(r, importEvents[r.id]?.at, now));
  const doneImports = imports.filter((r) => reminderSatisfied(r, importEvents[r.id]?.at, now));
  if (imports.length) {
    sections.push({
      title: "Files to import",
      count: outstandingImports.length ? `${outstandingImports.length} outstanding` : "all done",
      countTone: outstandingImports.length ? undefined : "good",
      items: [
        ...outstandingImports.map((r) => ({ title: r.label, meta: r.when, sub: `Feeds ${r.feeds}`, path: r.link })),
        ...doneImports.map((r) => {
          const ev = importEvents[r.id];
          const when = ev ? new Date(ev.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
          return { title: r.label, meta: `Imported ${when}${ev?.by ? ` by ${titleCase(ev.by)}` : ""}`, tone: "good" as const, path: r.link };
        }),
      ],
    });
  }

  // ── GL uploads behind — grouped by how far each has posted ───────────────
  const behind = outstanding?.behind ?? [];
  if (outstanding && behind.length) {
    const exp = `${MON_SHORT[outstanding.expected.period - 1]} ${outstanding.expected.year}`;
    const groups = new Map<string, OutstandingGl[]>();
    for (const b of behind) {
      const k = b.latest ? `Through ${MON_SHORT[b.latest.period - 1]} ${b.latest.year}` : "No GL yet";
      groups.set(k, [...(groups.get(k) ?? []), b]);
    }
    const items: PortalItem[] = [];
    for (const [k, list] of groups) {
      // A few properties: one row each, straight to its statement. Many: one
      // row for the group, the codes underneath.
      if (list.length <= 4) for (const b of list) items.push({ title: `${b.propertyCode} · ${b.name}`, meta: k, path: `/financials/operating-statements?key=${encodeURIComponent(b.propertyCode)}` });
      else items.push({ title: `${list.length} properties`, meta: k, sub: list.map((b) => b.propertyCode).join(" · "), path: "/financials/operating-statements" });
    }
    sections.push({
      title: `GL uploads due through ${exp}`,
      count: `${behind.length} behind`,
      countTone: "warn",
      items,
      note: "Post PM & AP, close the month, then upload each GL.",
      link: { label: "Open Operating Statements", path: "/financials/operating-statements" },
    });
  }

  // ── Not posted to the GL — a property's interest + amortization read as one
  //    debt payment ───────────────────────────────────────────────────────────
  if (notPosted.length) {
    const byKey = new Map<string, NotPostedItem[]>();
    for (const i of notPosted) {
      const k = `${i.key}|${i.period}|${i.type === "missing-debt" ? "debt" : i.line}`;
      byKey.set(k, [...(byKey.get(k) ?? []), i]);
    }
    const rows = [...byKey.values()].map((list) => {
      const f = list[0];
      const debt = f.type === "missing-debt";
      return {
        amount: list.reduce((t, i) => t + i.expected, 0),
        item: {
          title: `${f.propertyCode} · ${f.propertyName}`,
          sub: `${debt ? `Debt service (${list.map((i) => i.line).join(" + ")})` : f.line} · ${f.monthLabel}`,
          meta: `~${money0(list.reduce((t, i) => t + i.expected, 0))}`,
          tone: "warn" as const,
          path: `/financials/operating-statements?key=${encodeURIComponent(f.key)}&year=${year}&period=${f.period}`,
        },
      };
    }).sort((a, b) => b.amount - a.amount);
    const propCount = new Set(notPosted.map((i) => i.key)).size;
    sections.push({
      title: "Not posted to the GL",
      count: plural(propCount, "property", "properties"),
      countTone: "warn",
      items: rows.slice(0, 15).map((r) => r.item),
      note: `A scheduled payment or a budgeted tax, insurance or fee line still reads $0${rows.length > 15 ? `; ${rows.length - 15} more on the review page` : ""}. Post it, or dismiss it if it doesn't apply.`,
      link: { label: "Open Flags to Investigate", path: "/financials/operating-statements/review" },
    });
  }

  // ── Tenants to close out — each opens its close-out ──────────────────────
  if (vacated.length) {
    sections.push({
      title: "Tenants to close out",
      count: `${vacated.length} vacated`,
      countTone: "warn",
      items: vacated.map((v) => ({
        title: v.occupantName,
        sub: `${v.unitRef}${v.sqft ? ` · ${v.sqft.toLocaleString()} SF` : ""}`,
        path: `/cam-recon/interim?property=${encodeURIComponent(v.propertyCode)}&unitRef=${encodeURIComponent(v.unitRef)}`,
      })),
      note: "Left the rent roll in the last ~60 days.",
    });
  }

  const email = portalEmail({
    subject: "",
    eyebrow: "Your Week",
    title: "Good morning, Drew",
    lead: range,
    stats: [
      { label: "Tasks open", value: String(open.length), tone: open.length ? undefined : "good", path: "/tracker" },
      { label: "GLs behind", value: String(behind.length), tone: behind.length ? "warn" : "good", path: "/financials/operating-statements" },
      { label: "Not posted", value: String(new Set(notPosted.map((i) => i.key)).size), tone: notPosted.length ? "warn" : "good", path: "/financials/operating-statements/review" },
      { label: "To close out", value: String(vacated.length), tone: vacated.length ? "warn" : "good", path: "/cam-recon/interim" },
    ],
    rows: [],
    sections,
    link: { label: "Open the Task Tracker", path: "/tracker" },
  });

  const parts: string[] = [];
  if (open.length) parts.push(`${open.length} task${open.length === 1 ? "" : "s"}`);
  if (behind.length) parts.push(`${behind.length} GL upload${behind.length === 1 ? "" : "s"} behind`);
  if (notPosted.length) parts.push(`${new Set(notPosted.map((i) => i.key)).size} not posted`);
  if (vacated.length) parts.push(`${vacated.length} to close out`);
  const subject = parts.length ? `Your week — ${parts.join(", ")} (${range})` : `Your week — all clear (${range})`;

  return { subject, textBody: email.text, htmlBody: email.html, open, doneCount, imports, behind, vacated, notPosted };
}

