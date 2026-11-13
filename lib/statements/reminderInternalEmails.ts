// The team's side of the monthly tenant notices — three internal emails, in
// the PORTAL'S email look (`portalEmail`, the same as every other staff email):
//
//   • Greg: the month's notices are ready to review and send
//   • Tami: a tenant asked us to apply a credit — post it before statements
//   • Drew + Tami: every credit tenants asked to apply this month (the
//     business day before the 25th), unposted first
//
// Pure: the routes and the cron send what these build.

import { portalEmail } from "@/lib/email/portalEmail";
import type { BatchCounts, CreditRequest } from "./reminderBatch";
import type { CreditPlan } from "./monthlyReminder";

export const NOTICES_PATH = "/tenant-statements/notices";

const usd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthName = (ym: string) => new Date(`${ym.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const shortDate = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ─── Greg ────────────────────────────────────────────────────────────────────

export function approvalRequestEmail(x: { month: string; nextYM: string; counts: BatchCounts; dataAsOf: string | null }): { subject: string; html: string; text: string } {
  const c = x.counts;
  // The three counts ARE the headline (owner: "put the 9 23 and 10 where the
  // 40 is … clean it up a little bit and tighten").
  return portalEmail({
    subject: `${c.toSend} tenant account notices ready to send — ${monthName(x.month)}`,
    eyebrow: "Tenant Notices",
    title: `${c.toSend} notices ready to send`,
    lead: "Everyone is set to send. Untick anyone to hold back, then press Send.",
    statsFirst: true,
    stats: [
      { label: "Past due", value: String(c.byTier["past-due"]), tone: c.byTier["past-due"] ? "warn" : undefined },
      { label: "Courtesy", value: String(c.byTier.courtesy) },
      { label: "Credit", value: String(c.byTier.credit) },
    ],
    rows: [
      { label: "Data through", value: x.dataAsOf ? shortDate(x.dataAsOf) : "" },
      { label: "No email on file", value: c.blocked ? `${plural(c.blocked, "tenant")} · not sent` : "", tone: "warn" },
    ],
    link: { label: `Review and send ${c.toSend} notices`, path: NOTICES_PATH },
  });
}

// ─── Tami: post this credit ──────────────────────────────────────────────────

const planRows = (plan: CreditPlan, nextYM: string): string[][] => [
  ...plan.toOpen.map((l) => [l.description, shortDate(l.dateISO), usd(l.applied)]),
  ...(plan.toNext > 0.005 ? [[`${monthName(nextYM)} statement charges`, "Next statement", usd(plan.toNext)]] : []),
];

export function postCreditEmail(r: CreditRequest): { subject: string; html: string; text: string } {
  const applied = r.plan.appliedToOpen + r.plan.toNext;
  return portalEmail({
    subject: `Apply credit: ${r.tenantName} (${r.unitRef}) — ${usd(applied)} before ${monthName(r.nextYM)} statements`,
    eyebrow: "Credit to Apply",
    title: r.tenantName,
    figure: { value: usd(applied), label: "credit to post" },
    lead: `The tenant asked us to apply their credit. Post it in Skyline before the ${monthName(r.nextYM)} statements go out, so their statement shows it.`,
    rows: [
      { label: "Suite", value: r.unitRef, code: true },
      { label: "Property", value: r.propertyName },
      { label: "Asked", value: shortDate(r.requestedAt) },
      { label: "Credit left after", value: r.plan.remaining > 0.005 ? usd(r.plan.remaining) : "" },
      { label: "Tenant", value: "Sent a confirmation", tone: "good" },
    ],
    table: { title: "Apply to", columns: ["Charge", "Date", "Amount"], rows: planRows(r.plan, r.nextYM), total: ["Total", "", usd(applied)] },
    link: { label: "Mark it posted", path: NOTICES_PATH },
  });
}

// ─── Drew + Tami: the month's credits, before statements ────────────────────

export function creditSummaryEmail(x: { month: string; nextYM: string; requests: CreditRequest[] }): { subject: string; html: string; text: string } {
  const open = x.requests.filter((r) => !r.postedAt);
  const total = x.requests.reduce((a, r) => a + r.plan.appliedToOpen + r.plan.toNext, 0);
  const next = monthName(x.nextYM);
  if (!x.requests.length) {
    return portalEmail({
      subject: `No tenant credits to apply before ${next} statements`,
      eyebrow: "Credits Before Statements",
      title: "No credits to apply",
      lead: `No tenant asked us to apply a credit from this month's notices. Nothing extra to post before the ${next} statements.`,
      rows: [],
      link: { label: "Open Tenant Notices", path: NOTICES_PATH },
    });
  }
  return portalEmail({
    subject: `${plural(x.requests.length, "tenant credit")} to apply before ${next} statements${open.length ? ` — ${open.length} not posted` : " — all posted"}`,
    eyebrow: "Credits Before Statements",
    title: open.length ? `${plural(open.length, "credit")} still to post` : "Every credit is posted",
    figure: { value: usd(total), label: `${plural(x.requests.length, "credit")} tenants asked us to apply` },
    lead: `Make sure each is posted in Skyline before the ${next} statements go out on the 25th.`,
    stats: [
      { label: "Not posted", value: String(open.length), tone: open.length ? "warn" : "good" },
      { label: "Posted", value: String(x.requests.length - open.length), tone: "good" },
    ],
    rows: [],
    sections: [{
      title: "Tenants",
      count: open.length ? `${open.length} to post` : "all posted",
      countTone: open.length ? "warn" : "good",
      items: x.requests.map((r) => ({
        title: `${r.tenantName} · ${usd(r.plan.appliedToOpen + r.plan.toNext)}`,
        sub: `${r.propertyName}, Suite ${r.suite} · ${planRows(r.plan, r.nextYM).map(([d, , a]) => `${d} ${a}`).join(" · ")}`,
        meta: r.postedAt ? `Posted${r.postedBy ? ` · ${r.postedBy}` : ""}` : "Not posted",
        tone: r.postedAt ? "good" : "warn",
      })),
    }],
    link: { label: "Open Tenant Notices", path: NOTICES_PATH },
  });
}
