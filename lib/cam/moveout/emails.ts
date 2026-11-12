// The two move-out close-out emails, in the PORTAL'S look (owner, 11/2026:
// "they should show the workflow status since this is a chain step"). A
// close-out is four hand-offs — moved out → final bill sent → approved →
// charges posted — and each email opens on that chain, so whoever receives it
// sees what came before and what their click sets off:
//   1. the APPROVAL email to Nancy (office) / Harry (retail),
//   2. the CHARGES email to Tanya once it is approved.
// Pure: the routes gather the figures, this lays them out (HTML + text).

import { portalEmail, type PortalStep } from "@/lib/email/portalEmail";
import type { MoveoutSettlement } from "./deposit";
import { escrowNote } from "./openAr";

const money = (n: number) => {
  const s = "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < -0.004 ? `(${s})` : s;
};
const plain = (n: number) => money(n).replace("$", "");
const dateUS = (iso: string | null | undefined) => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : null;
};
const short = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type MoveoutEmailInput = {
  name: string;
  suite: string;
  unitRef: string;
  propertyName: string;
  /** "7/31/2026", else the as-of month is used. */
  leaseTo: string | null;
  asOfMonth: number;
  year: number;
  /** "CAM/RET" (office) or "CAM/INS/RET" (retail). */
  cats: string;
  settlement: MoveoutSettlement;
  approverFirst: string;
  chargesName: string;
  /** The close-out page. */
  path: string;
};

const movedOutOn = (i: MoveoutEmailInput) => i.leaseTo ?? `${MONTHS[i.asOfMonth - 1]} ${i.year}`;

/** What is left once the deposit is netted — the one figure the bill is about. */
function bottomLine(s: MoveoutSettlement): { value: number; label: string; tone: "good" | "warn" } {
  const dep = s.deposit;
  if (dep && dep.net != null) {
    return dep.net >= 0
      ? { value: dep.net, label: "Refund to the tenant, after the deposit", tone: "good" }
      : { value: -dep.net, label: "Still due from the tenant, after the deposit", tone: "warn" };
  }
  return s.totalDue >= 0
    ? { value: s.totalDue, label: "Due from the tenant", tone: "warn" }
    : { value: -s.totalDue, label: "Credit owed to the tenant", tone: "good" };
}

/** The settlement, top to bottom, as the Final Bill reads. */
function billTable(i: MoveoutEmailInput) {
  const s = i.settlement;
  const rows: string[][] = [[`${i.cats} reconciliation`, plain(s.reconBalance)]];
  const asOf = dateUS(s.openAr?.asOf);
  rows.push([`Unpaid charges${asOf ? ` (as of ${asOf})` : ""}`, s.openAr ? plain(s.openAr.balance) : "Not imported"]);
  rows.push(["Total due", plain(s.totalDue)]);
  const dep = s.deposit;
  if (dep && dep.net != null) rows.push([`Less security deposit${dep.status === "partial" ? " (part refunded)" : ""}`, plain(-dep.amount)]);
  const b = bottomLine(s);
  const notes = [
    escrowNote(s.openAr),
    !dep ? "No security deposit on record for this suite." : dep.net == null ? `The deposit is ${dep.status}, so it is not netted.` : null,
  ].filter(Boolean).join(" ");
  return {
    title: "Final bill",
    columns: ["", "Amount"],
    rows,
    total: [dep && dep.net != null ? (dep.net >= 0 ? "Refund" : "Balance due") : s.totalDue >= 0 ? "Balance due" : "Credit", plain(b.value)],
    note: notes || undefined,
  };
}

/** The chain, with this email's step marked "now". */
function chain(i: MoveoutEmailInput, at: "approve" | "post", o: { sentBy?: string; sentAt: Date; approvedBy?: string; approvedAt?: Date }): PortalStep[] {
  return [
    { label: "Moved out", state: "done", sub: movedOutOn(i) },
    { label: "Final bill sent", state: "done", sub: [o.sentBy ?? "Portal", short(o.sentAt)].join(" · ") },
    at === "approve"
      ? { label: `${i.approverFirst} approves`, state: "current", sub: "You" }
      : { label: `${i.approverFirst} approved`, state: "done", sub: [o.approvedBy ?? i.approverFirst, o.approvedAt ? short(o.approvedAt) : ""].filter(Boolean).join(" · ") },
    { label: `${i.chargesName} posts charges`, state: at === "post" ? "current" : "todo", sub: at === "post" ? "You" : undefined },
  ];
}

/** 1 — to the approver, the Final Bill PDF attached. */
export function approvalEmail(i: MoveoutEmailInput & {
  sentBy?: string; sentAt?: Date;
  /** Occupied months the GL has not posted yet, and the month it reaches. */
  unpostedMonths: number; postedThrough?: number;
}) {
  const s = i.settlement;
  const b = bottomLine(s);
  const before: string[] = [];
  if (!s.openAr) before.push(`Import their final Laser Statement on the close-out page so the unpaid charges are on the bill. Skyline lists them as ${i.unitRef}-FO.`);
  if (i.unpostedMonths > 0) before.push(`The GL is posted through ${MONTHS[(i.postedThrough ?? 1) - 1]}; ${i.unpostedMonths} occupied month${i.unpostedMonths === 1 ? " is" : "s are"} still to post, and approval opens once ${i.unpostedMonths === 1 ? "it is" : "they are"}.`);
  return portalEmail({
    subject: `Approve final bill: ${i.name} (${i.unitRef})`,
    eyebrow: "Move-Out Close-Out",
    steps: chain(i, "approve", { sentBy: i.sentBy, sentAt: i.sentAt ?? new Date() }),
    title: `Approve ${i.name}'s final bill`,
    lead: `Suite ${i.suite} · ${i.propertyName}`,
    figure: { value: money(b.value), label: b.label },
    rows: [],
    table: billTable(i),
    note: before.length ? { label: "Before you approve", text: before.join("\n") } : undefined,
    link: { label: "Review & approve", path: i.path },
    footer: `Final Bill PDF attached · once approved, the charges go to ${i.chargesName} to post`,
  });
}

/** 2 — to the charges poster once approved (cc the approver), the PDF and the
 *  Skyline CSV attached. */
export function chargesEmail(i: MoveoutEmailInput & {
  sentBy?: string; sentAt?: Date; approvedBy?: string; approvedAt?: Date;
  charges: { description: string; code: string; amount: number }[];
  effectiveDate: string;
  hasCsv: boolean;
}) {
  const b = bottomLine(i.settlement);
  const total = i.charges.reduce((t, c) => t + c.amount, 0);
  const eff = dateUS(i.effectiveDate) ?? i.effectiveDate;
  return portalEmail({
    subject: `Post move-out charges: ${i.name} (${i.unitRef})`,
    eyebrow: "Move-Out Close-Out",
    steps: chain(i, "post", { sentBy: i.sentBy, sentAt: i.sentAt ?? i.approvedAt ?? new Date(), approvedBy: i.approvedBy, approvedAt: i.approvedAt ?? new Date() }),
    title: i.charges.length ? `Post ${i.name}'s move-out charges` : `${i.name}'s close-out has nothing to post`,
    lead: `Suite ${i.suite} · ${i.propertyName}`,
    rows: [
      { label: "Account", value: `${i.unitRef}-CU`, code: true },
      { label: "Effective", value: eff },
      { label: "Final bill", value: `${money(b.value)} ${b.tone === "good" ? (i.settlement.deposit?.net != null ? "refund" : "credit") : "due"}`, tone: b.tone },
    ],
    table: i.charges.length
      ? { title: "Charges to post", columns: ["Charge", "Code", "Amount"], rows: i.charges.map((c) => [c.description, c.code, plain(c.amount)]), total: ["Total", "", plain(total)], align: ["left", "left", "right"] }
      : undefined,
    note: i.charges.length ? undefined : { label: "Nothing to post", text: `The ${i.cats} true-up nets to $0.` },
    link: { label: "Open the close-out", path: i.path },
    footer: `Attached: the Final Bill PDF${i.hasCsv ? " and the Skyline charge import (CSV)" : ""}`,
  });
}
