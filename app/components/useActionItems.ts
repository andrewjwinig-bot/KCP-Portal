"use client";

// EVERYONE'S OPEN ACTION ITEMS — ONE LIST (owner, 11/2026: "audit everyone and
// make sure their sidebar notifications are displaying properly when there are
// action items or reminders for them … any action items should also appear
// under Action Items on his dashboard"). The dashboard's Action Items strip and
// the sidebar's badges both read this, so a reminder on the dashboard always
// carries a count in the sidebar and the two can never disagree.
//
// Each item names the page that does it (`href`) and the sidebar item that
// carries its count (`nav` — the page itself, or the Dashboard when the work is
// done there). Every source is read by the SAME endpoint the page itself uses;
// a source the viewer cannot open answers 403 and simply adds nothing.

import { useEffect, useState } from "react";
import { isRowCoded } from "@/lib/expenses/coding";

export type ActionItem = {
  id: string;
  title: string;
  /** One line: what to do, or when it is due. */
  sub: string;
  href: string;
  /** The sidebar item (its href) that counts it. */
  nav: string;
  /** How many it stands for on the badge (5 charges to code = 5). */
  count: number;
  tone: "warning" | "danger";
  /** Shows a Done button; the tick is kept in this browser (`markActionDone`). */
  dismissable?: boolean;
};

// Items ticked Done (only the dismissable kind — a reminder whose work happens
// outside the portal, like calling the plow contractor). Per browser.
const DONE_KEY = "kcp:action-done";
const readDone = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]")); } catch { return new Set(); }
};
export function markActionDone(id: string) {
  try {
    const d = readDone(); d.add(id);
    localStorage.setItem(DONE_KEY, JSON.stringify([...d].slice(-100)));
  } catch { /* storage blocked: it simply stays */ }
  cache.clear();
  window.dispatchEvent(new Event("kcp:action-items"));
}

type Who = { id: string; navKeys: Set<string> };

const getJson = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

const fmtDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

async function load(who: Who): Promise<ActionItem[]> {
  const admin = who.navKeys.has("all");
  const has = (k: string) => admin || who.navKeys.has(k);
  const is = (...ids: string[]) => admin || ids.includes(who.id);
  const jobs: Promise<ActionItem[]>[] = [];

  // Seasonal tenant emails (Winter Tips, Seasonal Care …) — Greg.
  if (has("communications")) jobs.push(getJson("/api/communications?due=1").then((j) =>
    (j?.due ?? []).map((d: { id: string; name: string; dueISO: string; overdue: boolean }) => ({
      id: `comms-${d.id}`, title: `Send ${d.name}`, sub: `${d.overdue ? "Was due" : "Send by"} ${fmtDay(d.dueISO)} · draft it in Outlook`,
      href: "/communications", nav: "/communications", count: 1, tone: d.overdue ? "danger" : "warning",
    } as ActionItem))));

  // Weather coming to the Interplex in the next 48 hours (NWS forecast) —
  // suggest the matching weather email (owner: "if it drops below 15 degrees
  // prompt extreme cold alert").
  if (has("communications")) jobs.push(getJson("/api/communications?weather=1").then((j) =>
    (j?.weather ?? []).map((w: { template: string; name: string; reason: string }) => ({
      id: `weather-${w.template}`, title: `Send the ${w.name}`, sub: `Forecast: ${w.reason}`,
      href: "/communications", nav: "/communications", count: 1, tone: "warning",
    } as ActionItem)).concat(
      // Snow or ice coming → line up salting / plowing (owner: "if theres snow
      // or ice in the forecast … put on gregs list to reach out for
      // salting/plowing"). Not cleared by the email — ticked Done once he has
      // called, one item per storm (its start day).
      (j?.signals ?? []).filter((w: { template: string }) => w.template === "snow-alert").map((w: { reason: string; startsISO: string }) => ({
        id: `plow-${w.startsISO.slice(0, 10)}`, title: "Line Up Salting & Plowing", sub: `Snow or ice coming: ${w.reason} · call the snow contractor`,
        href: "/dashboard", nav: "/dashboard", count: 1, tone: "warning", dismissable: true,
      } as ActionItem)),
    )));

  // The month's tenant notices, waiting for Greg's approval.
  if (who.navKeys.has("tenant-notices")) jobs.push(getJson("/api/tenant-notices").then((j) => {
    const b = j?.batch;
    if (!b || b.approvedAt || !j?.counts?.toSend) return [];
    return [{ id: `notices-${b.month}`, title: `Approve ${monthName(b.month)}'s Tenant Notices`, sub: `${j.counts.toSend} ready to send`,
      href: "/tenant-statements/notices", nav: "/tenant-statements/notices", count: j.counts.toSend, tone: "warning" } as ActionItem];
  }));

  // Credit-card charges still to code — the cardholder's own, or the whole
  // statement for the person who sends it (Harry).
  jobs.push(getJson("/api/expenses/working").then((j) => {
    if (!j?.ok) return [];
    const left = (j.tx ?? []).filter((t: Parameters<typeof isRowCoded>[0]) => !isRowCoded(t)).length;
    if (!left) return [];
    const href = j.full ? "/expenses" : who.navKeys.has("my-card") ? "/expenses/mine" : "/dashboard";
    return [{ id: "cc-code", title: "Code Credit Card Charges", sub: `${plural(left, "charge")} still to code${j.statementPeriodText ? ` · ${j.statementPeriodText}` : ""}`,
      href, nav: href, count: left, tone: "warning" } as ActionItem];
  }));

  // New shopping-centre tenants to describe for the website — Harry.
  if (is("harry")) jobs.push(getJson("/api/centers/tenant-profiles").then((j) => {
    const n = (j?.pending ?? []).length;
    return n ? [{ id: "tenant-profiles", title: "New Tenants on the Website", sub: `${plural(n, "tenant")} to describe before the public sees them`,
      href: "/dashboard", nav: "/dashboard", count: n, tone: "warning" } as ActionItem] : [];
  }));

  // Move-out close-outs ready (to send for approval, or to approve).
  if (is("drew", "harry", "nancy")) jobs.push(getJson("/api/cam-recon/moveout").then((j) => {
    const n = (j?.closeOuts ?? []).filter((c: { status: string }) => c.status === "ready").length;
    const approver = who.id === "nancy" || who.id === "harry";
    return n ? [{ id: "closeouts", title: approver ? "Approve Move-Out Close-Outs" : "Move-Out Close-Outs Ready", sub: `${plural(n, "close-out")} ready${approver ? " for your approval" : " to send for approval"}`,
      href: "/cam-recon/interim", nav: "/dashboard", count: n, tone: "warning" } as ActionItem] : [];
  }));

  // A batch processed but never sent to AvidXchange — whoever sends that flow.
  jobs.push(getJson("/api/avid-sends?limit=1").then((j) => {
    const mine: Record<string, { href: string; who: string[] }> = {
      allocated: { href: "/allocated-invoicer", who: ["drew"] },
      payroll: { href: "/", who: ["harry"] },
      "credit-card": { href: "/expenses", who: ["harry"] },
    };
    return (j?.unsent ?? []).flatMap((u: { source: string; label: string; period: string; days: number }) => {
      const m = mine[u.source];
      if (!m || !is(...m.who)) return [];
      return [{ id: `unsent-${u.source}`, title: `Send ${u.label} to AvidXchange`, sub: `${u.period} was processed ${plural(u.days, "day")} ago and not sent`,
        href: m.href, nav: m.href, count: 1, tone: "danger" } as ActionItem];
    });
  }));

  // A quarter's CAM / tax billing not yet sent (Wawa at Lafayette Hill) — Drew.
  if (is("drew")) jobs.push(getJson("/api/cam-recon/quarterly/due").then((j) =>
    (j?.due ?? []).map((q: { key: string; name: string; year: number; quarter: string; due: string; overdue: boolean; href: string; reason: string }) => ({
      id: `qcam-${q.key}-${q.year}-${q.quarter}`, title: `${q.name} · ${q.quarter} ${q.year}`, sub: `${q.overdue ? "Overdue — was due" : "Due"} ${fmtDay(q.due)} · ${q.reason}`,
      href: q.href || "/cam-recon", nav: "/cam-recon", count: 1, tone: q.overdue ? "danger" : "warning",
    } as ActionItem))));

  // Receipts the tenant has had their two days on — ready to key in Skyline (Tami).
  if (is("tami")) jobs.push(getJson("/api/tenant-statements/receipts").then((j) => {
    const n = (j?.receipts ?? []).filter((r: { status: string }) => r.status === "apply").length;
    return n ? [{ id: "receipts-apply", title: "Receipts Ready to Apply", sub: `${plural(n, "payment")} to post in Skyline`,
      href: "/tenant-statements", nav: "/tenant-statements", count: n, tone: "warning" } as ActionItem] : [];
  }));

  const done = readDone();
  return (await Promise.all(jobs)).flat().filter((i) => !(i.dismissable && done.has(i.id)));
}

// One read per person per minute, shared by the sidebar and the dashboard.
const cache = new Map<string, { at: number; p: Promise<ActionItem[]> }>();
export function fetchActionItems(who: Who, fresh = false): Promise<ActionItem[]> {
  const hit = cache.get(who.id);
  if (!fresh && hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = load(who).catch(() => []);
  cache.set(who.id, { at: Date.now(), p });
  return p;
}

export function useActionItems(who: Who | null, refreshMs = 5 * 60_000): ActionItem[] {
  const [items, setItems] = useState<ActionItem[]>([]);
  const id = who?.id ?? "";
  useEffect(() => {
    if (!who || !id) { setItems([]); return; }
    let alive = true;
    const run = (fresh: boolean) => fetchActionItems(who, fresh).then((x) => { if (alive) setItems(x); });
    run(false);
    const t = setInterval(() => run(true), refreshMs);
    const onChange = () => run(true);
    window.addEventListener("kcp:action-items", onChange);
    return () => { alive = false; clearInterval(t); window.removeEventListener("kcp:action-items", onChange); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refreshMs]);
  return items;
}

/** The badge count per sidebar href. */
export function badgesByNav(items: ActionItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i.nav] = (out[i.nav] ?? 0) + i.count;
  return out;
}
