// The Monday digest to Drew (owner, 11/2026: "cleaned up … more useful with
// integrated html links"): the week's tasks, imports, GL uploads behind,
// lines not posted and tenants to close out, in the portal's email look
// (lib/email/portalEmail.ts), every item a link to the page that does it.
// Pure — the cron route gathers the data and sends.

import { type TaskOccurrence } from "@/lib/tracker/taskDefs";
import { completionKey } from "@/lib/tracker/completionStore";
import { importsForWeek } from "@/lib/tracker/imports";
import { reminderOutstanding, type ImportEvent } from "@/lib/tracker/importEvents";
import type { OutstandingGl } from "@/lib/financials/operating-statements/outstanding";
import type { VacatedTenant } from "@/lib/leasing/recentlyVacated";
import type { NotPostedItem } from "@/lib/financials/operating-statements/notPosted";
import { portalEmail, type PortalSection } from "@/lib/email/portalEmail";

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
  const sections: PortalSection[] = [];
  // Kept short (owner: "its still pretty busy"): one line per item, the
  // counts once (in the figures up top), no notes, no repeats.

  // ── This week: the open tasks, plus any import that isn't already a task ─
  const imports = importsForWeek(start, end).filter((r) => (r.owner ?? "drew") === "drew");
  const outstandingImports = imports.filter((r) => reminderOutstanding(r, importEvents[r.id]?.at, now));
  const taskNames = new Set(open.map((o) => o.label.toLowerCase()));
  sections.push({
    title: "This week",
    items: [
      ...open.map((o) => ({ title: o.label, meta: fmtDate(o.date), path: o.link ?? "/tracker" })),
      ...outstandingImports.filter((r) => !taskNames.has(r.label.toLowerCase()))
        .map((r) => ({ title: `Import ${r.label}`, meta: r.when, path: r.link })),
    ],
    empty: tasks.length ? `All ${tasks.length} tasks done.` : "Nothing scheduled.",
  });

  // ── GL uploads past due: each one, straight to its statement ────────────
  const behind = outstanding?.behind ?? [];
  if (outstanding && behind.length) {
    const exp = `${MON_SHORT[outstanding.expected.period - 1]} ${outstanding.expected.year}`;
    sections.push({
      title: `GL uploads past due · ${exp}`,
      items: behind.map((b) => ({
        title: b.name,
        meta: b.latest ? `Posted through ${MON_SHORT[b.latest.period - 1]} ${b.latest.year}` : "No GL yet",
        tone: "warn" as const,
        path: `/financials/operating-statements?key=${encodeURIComponent(b.propertyCode)}`,
      })),
    });
  }

  // ── Not posted: one line per property ────────────────────────────────────
  if (notPosted.length) {
    const byKey = new Map<string, NotPostedItem[]>();
    for (const i of notPosted) {
      const k = `${i.key}|${i.period}|${i.type === "missing-debt" ? "debt" : i.line}`;
      byKey.set(k, [...(byKey.get(k) ?? []), i]);
    }
    const rows = [...byKey.values()].map((list) => {
      const f = list[0];
      const amount = list.reduce((t, i) => t + i.expected, 0);
      const what = f.type === "missing-debt" ? "Debt service" : f.line;
      return {
        amount,
        item: {
          title: f.propertyName,
          meta: `${what} · ${f.monthLabel.slice(0, 3)} · ${money0(amount)}`,
          tone: "warn" as const,
          path: `/financials/operating-statements?key=${encodeURIComponent(f.key)}&year=${year}&period=${f.period}`,
        },
      };
    }).sort((x, y) => y.amount - x.amount);
    sections.push({
      title: "Not posted to the GL",
      items: rows.slice(0, 10).map((r) => r.item),
      link: rows.length > 10 ? { label: `${rows.length - 10} more on Flags to Investigate`, path: "/financials/operating-statements/review" } : undefined,
    });
  }

  // ── Tenants to close out: one line each ──────────────────────────────────
  if (vacated.length) {
    sections.push({
      title: "Tenants to close out",
      items: vacated.map((v) => ({
        title: v.occupantName,
        meta: v.unitRef,
        path: `/cam-recon/interim?property=${encodeURIComponent(v.propertyCode)}&unitRef=${encodeURIComponent(v.unitRef)}`,
      })),
    });
  }

  const email = portalEmail({
    subject: "",
    eyebrow: "Your Week",
    title: "Good morning, Drew",
    lead: range,
    stats: [
      { label: "Tasks open", value: String(open.length), tone: open.length ? undefined : "good", path: "/tracker" },
      { label: "GLs past due", value: String(behind.length), tone: behind.length ? "warn" : "good", path: "/financials/operating-statements" },
      { label: "Not posted", value: String(new Set(notPosted.map((i) => i.key)).size), tone: notPosted.length ? "warn" : "good", path: "/financials/operating-statements/review" },
      { label: "To close out", value: String(vacated.length), tone: vacated.length ? "warn" : "good", path: "/cam-recon/interim" },
    ],
    rows: [],
    sections,
    systemFooter: false,
  });

  const parts: string[] = [];
  if (open.length) parts.push(`${open.length} task${open.length === 1 ? "" : "s"}`);
  if (behind.length) parts.push(`${behind.length} GL${behind.length === 1 ? "" : "s"} past due`);
  if (notPosted.length) parts.push(`${new Set(notPosted.map((i) => i.key)).size} not posted`);
  if (vacated.length) parts.push(`${vacated.length} to close out`);
  const subject = parts.length ? `Your week — ${parts.join(", ")} (${range})` : `Your week — all clear (${range})`;

  return { subject, textBody: email.text, htmlBody: email.html, open, doneCount, imports, behind, vacated, notPosted };
}

