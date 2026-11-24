// THE MONTHLY U&O CYCLE, run by itself (owner, 11/2026: "as autonomous as
// possible"). The filing instructions' calendar:
//
//   the 16th   the delinquent review opens: Greg and Harry are emailed the
//              tenants with U&O still open on the laser statement — they (or
//              Nancy) confirm who is reported delinquent on the page
//   the 20th   not confirmed yet → a reminder, Drew copied
//   confirmed  (or the 21st, whichever first) Drew gets the month's returns —
//              every UO1 line to key on the City's site, the UO3 tenants, the
//              Skyline reversals — with the payment JE attached
//   filed      each property marked filed freezes its figures; the last one
//              ticks the tracker's "Philadelphia U&O" task
//   the 26th   anything not filed → Drew is told once
//
// Weekend days move to the next business day (`isBusinessDay`).

import "server-only";
import * as XLSX from "xlsx";
import { VERIFIED_FROM } from "@/lib/mail";
import { sendMailDetailed } from "./mail";
import { portalEmail } from "@/lib/email/portalEmail";
import { markTaskComplete } from "@/lib/tracker/completionStore";
import { etToday, isBusinessDay } from "@/lib/statements/reminderSchedule";
import { UO_DUE_DAY, UO_FILE_BY_DAY, UO_PROPERTIES, UO_REVIEW_DAY } from "./config";
import { journalLines, type UoJeLine, type UoLines } from "./compute";
import { loadUoMonth, type UoMonthView } from "./load";
import { emptyMonth, getUoMonth, saveUoMonth, type UoMonth } from "./store";
import { refreshCityAssessments } from "./assessmentsLoad";

export const UO_PAGE = "/uo-tax";
export const UO_TASK_ID = "m-uo";
/** Who reviews the delinquents (the instructions' "Arnie and Harry" — Greg now). */
export const UO_REVIEW_TO = (process.env.UO_REVIEW_TO ?? "gmasciantonio@kormancommercial.com, hfeldman@kormancommercial.com").trim();
/** Who files the returns. */
export const UO_FILER_TO = (process.env.UO_FILER_TO ?? "dwinig@kormancommercial.com").trim();

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const pad = (n: number) => String(n).padStart(2, "0");

/** The first business day on or after day `d` of `month`. */
export function businessDayFrom(month: string, d: number): string {
  const dt = new Date(`${month}-${pad(d)}T12:00:00Z`);
  while (!isBusinessDay(dt.toISOString().slice(0, 10))) dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
export const reviewOpensOn = (month: string) => businessDayFrom(month, UO_REVIEW_DAY);
export const remindOn = (month: string) => businessDayFrom(month, 20);
export const fileByOn = (month: string) => businessDayFrom(month, UO_FILE_BY_DAY);
export const dueOn = (month: string) => `${month}-${pad(UO_DUE_DAY)}`;

/** Where the month stands, in one word for the page and the dashboard. */
export type UoStage = "not-open" | "review" | "ready" | "filed" | "overdue";
export function stageOf(rec: UoMonth, today: string): UoStage {
  const allFiled = UO_PROPERTIES.every((p) => rec.filed[p.code]);
  if (allFiled) return "filed";
  if (today > dueOn(rec.month)) return "overdue";
  if (rec.confirmedAt || today >= fileByOn(rec.month)) return "ready";
  if (today >= reviewOpensOn(rec.month)) return "review";
  return "not-open";
}

// ── The payment JE (a machine import — bare, no header, positional) ────────
export function jeRows(lines: UoJeLine[]): (string | number)[][] {
  return lines.map((l) => ["JRNL", l.property, l.account, "LT", l.date, l.description, l.reference, l.amount]);
}
export function jeWorkbook(lines: UoJeLine[]): Buffer {
  // Skyline's Standard JE Import reads by position from row 1 — never theme it.
  const ws = XLSX.utils.aoa_to_sheet(jeRows(lines));
  ws["!cols"] = [{ wch: 6 }, { wch: 6 }, { wch: 12 }, { wch: 4 }, { wch: 11 }, { wch: 26 }, { wch: 8 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

/** The JE for what is (or would be) filed: a filed property's frozen
 *  figures, else today's computation. */
export function jeFor(view: UoMonthView): UoJeLine[] {
  return journalLines(view.month, view.properties.filter((p) => p.filed || !p.noTenancy).map((p) => ({ code: p.code, lines: (p.filed?.lines ?? p.lines) as UoLines })));
}
export const jeFileName = (month: string) => `${month.slice(5, 7)}25${month.slice(2, 4)} ShopCtrs U&O direct debit.xlsx`;

// ── Emails ─────────────────────────────────────────────────────────────────
function reviewEmail(view: UoMonthView, reminder: boolean) {
  const byProp = new Map<string, typeof view.candidates>();
  for (const c of view.candidates) byProp.set(c.property, [...(byProp.get(c.property) ?? []), c]);
  return portalEmail({
    subject: `${reminder ? "Reminder: " : ""}U&O delinquents to confirm — ${monthName(view.month)}`,
    eyebrow: "Philadelphia U&O",
    title: `Who is delinquent for ${monthName(view.month)}?`,
    lead: `${view.candidates.length ? `${view.candidates.length} tenant${view.candidates.length === 1 ? "" : "s"} still show U&O open on the newest Aging Report or Laser Statement.` : "No tenant shows U&O open on the newest Aging Report or Laser Statement."} Tick anyone to report delinquent to the City and confirm the list — it is due by the ${UO_FILE_BY_DAY}st so Drew can file.`,
    rows: [],
    sections: [...byProp.entries()].map(([code, list]) => ({
      title: `${code} · ${view.properties.find((p) => p.code === code)?.name ?? code}`,
      items: list.map((c) => ({ title: c.tenant, meta: `${money(c.openUo)} open${c.lastMonth ? " · reported last month" : ""}`, sub: c.unitRef })),
    })),
    link: { label: "Review U&O delinquents", path: `${UO_PAGE}?month=${view.month}` },
  });
}

function readyEmail(view: UoMonthView) {
  const rows = view.properties.map((p) => {
    const l = p.filed?.lines ?? p.lines;
    return [`${p.code} · ${p.name}`, money(l.maxTax), money(l.totalOff), money(l.delinquent), money(l.beforeDiscount), money(l.discount), money(l.net)];
  });
  const sum = (k: keyof UoLines) => view.properties.reduce((s, p) => s + (p.filed?.lines ?? p.lines)[k], 0);
  const del = view.properties.flatMap((p) => p.returns.flatMap((r) => r.rows.filter((x) => x.status === "delinquent").map((x) => ({ p: p.code, ...x }))));
  return portalEmail({
    subject: `U&O ready to file — ${monthName(view.month)} (${money(sum("net"))})`,
    eyebrow: "Philadelphia U&O",
    title: `${monthName(view.month)} U&O is ready to file`,
    figure: { value: money(sum("net")), label: "to pay the City" },
    lead: `${view.record.confirmedAt ? `Delinquents confirmed by ${view.record.confirmedBy}.` : "Delinquents not confirmed — this uses the list as it stands."} Due the ${UO_DUE_DAY}th; file by the ${UO_FILE_BY_DAY}st. The payment JE is attached.`,
    rows: [],
    table: {
      title: "Each return",
      columns: ["Property", "Line 1", "Lines 2–3", "Line 8", "Line 9", "Line 10", "Pay"],
      align: ["left", "right", "right", "right", "right", "right", "right"],
      rows,
      total: ["Total", money(sum("maxTax")), money(sum("totalOff")), money(sum("delinquent")), money(sum("beforeDiscount")), money(sum("discount")), money(sum("net"))],
    },
    sections: del.length ? [{ title: "Report delinquent (UO3) and reverse in Skyline", items: del.map((d) => ({ title: d.tenant, meta: money(d.share), sub: `${d.unitRef} · REV ${view.month.slice(5, 7)}/${view.month.slice(2, 4)} U&O` })) }] : [],
    link: { label: "Open the U&O returns", path: `${UO_PAGE}?month=${view.month}` },
  });
}

async function send(to: string, e: { subject: string; html: string; text: string }, attach?: { name: string; content: Buffer }) {
  return sendMailDetailed({
    to, from: `KCP Portal <${VERIFIED_FROM}>`, subject: e.subject, htmlBody: e.html, textBody: e.text,
    attachments: attach ? [{ name: attach.name, content: new Uint8Array(attach.content), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }] : undefined,
  });
}

export async function sendReadyEmail(view: UoMonthView): Promise<boolean> {
  const r = await send(UO_FILER_TO, readyEmail(view), { name: jeFileName(view.month), content: jeWorkbook(jeFor(view)) });
  return r.ok;
}

// ── The daily tick ─────────────────────────────────────────────────────────
export async function uoTick(now = new Date()): Promise<Record<string, unknown>> {
  const today = etToday(now);
  const month = today.slice(0, 7);
  const done: string[] = [];
  // The City's assessed values, read once a week — every year, for good.
  const city = await refreshCityAssessments({ now }).catch(() => null);
  if (city?.checked) done.push(city.error ? `assessments: ${city.error}` : `assessments checked (${city.changes} changed)`);
  // December: the new year's UO charges to Tanya (januaryReset.ts). Imported
  // lazily — it imports this file.
  const reset = await import("./januaryReset").then((m) => m.januaryResetTick(now)).catch(() => null);
  if (reset) done.push(`assessments/${reset}`);
  const rec = (await getUoMonth(month)) ?? emptyMonth(month);
  const stage = stageOf(rec, today);
  if (stage === "not-open" || stage === "filed") return { month, stage, done };
  const view = await loadUoMonth(month);
  const at = now.toISOString();

  if (today >= reviewOpensOn(month) && !rec.reviewEmailedAt && !rec.confirmedAt) {
    if ((await send(UO_REVIEW_TO, reviewEmail(view, false))).ok) { rec.reviewEmailedAt = at; done.push("review emailed"); }
  }
  if (today >= remindOn(month) && !rec.confirmedAt && !rec.reviewRemindedAt && rec.reviewEmailedAt) {
    if ((await send(`${UO_REVIEW_TO}, ${UO_FILER_TO}`, reviewEmail(view, true))).ok) { rec.reviewRemindedAt = at; done.push("review reminder"); }
  }
  if ((rec.confirmedAt || today >= fileByOn(month)) && !rec.readyEmailedAt) {
    if (await sendReadyEmail({ ...view, record: rec })) { rec.readyEmailedAt = at; done.push("ready emailed"); }
  }
  if (stage === "overdue" && !rec.overdueEmailedAt) {
    const left = UO_PROPERTIES.filter((p) => !rec.filed[p.code]).map((p) => p.code);
    const e = portalEmail({
      subject: `OVERDUE: ${monthName(month)} U&O not filed (${left.join(", ")})`,
      eyebrow: "Philadelphia U&O", title: `${monthName(month)} U&O is past due`,
      lead: `Due the ${UO_DUE_DAY}th. Not marked filed: ${left.join(", ")}. Interest and penalty run from the due date, and the 1% discount is lost.`,
      rows: [], link: { label: "Open the U&O returns", path: `${UO_PAGE}?month=${month}` },
    });
    if ((await send(UO_FILER_TO, e)).ok) { rec.overdueEmailedAt = at; done.push("overdue emailed"); }
  }
  // Save ONLY the stamps this run set, onto a FRESH read — the review, the
  // confirm and "filed" marks made on the page while it ran stay (bug audit
  // 11/2026: the run's whole stale copy was written back over them).
  if (done.some((d) => !d.startsWith("assessments"))) {
    const fresh = (await getUoMonth(month)) ?? emptyMonth(month);
    for (const k of ["reviewEmailedAt", "reviewRemindedAt", "readyEmailedAt", "overdueEmailedAt"] as const) {
      if (rec[k] && !fresh[k]) fresh[k] = rec[k];
    }
    await saveUoMonth(fresh);
  }
  return { month, stage, done };
}

/** Greg / Harry / Nancy confirm the delinquents. Drew is sent the returns at once. */
export async function confirmDelinquents(month: string, units: string[], by: string, now = new Date()): Promise<UoMonth> {
  const rec = (await getUoMonth(month)) ?? emptyMonth(month);
  rec.delinquents = [...new Set(units.map((u) => u.toUpperCase()))];
  rec.confirmedAt = now.toISOString(); rec.confirmedBy = by;
  rec.updatedAt = rec.confirmedAt; rec.updatedBy = by;
  await saveUoMonth(rec);
  if (!rec.readyEmailedAt && etToday(now) >= reviewOpensOn(month)) {
    const view = await loadUoMonth(month);
    if (await sendReadyEmail(view)) { rec.readyEmailedAt = new Date().toISOString(); await saveUoMonth(rec); }
  }
  return rec;
}

/** Drew marks a property filed: its figures freeze; the last one ticks the task. */
export async function markFiled(month: string, code: string, by: string, now = new Date()): Promise<UoMonth> {
  const view = await loadUoMonth(month);
  const p = view.properties.find((x) => x.code === code);
  if (!p) throw new Error(`${code} does not file U&O.`);
  if (p.noTenancy) throw new Error(`No rent roll covers ${code} for ${monthName(month)} — import one first.`);
  const rec = view.record;
  rec.filed[code] = {
    at: now.toISOString(), by, lines: p.lines, discountTaken: p.discount,
    delinquents: p.returns.flatMap((r) => r.rows.filter((x) => x.status === "delinquent").map((x) => x.unitRef!)),
  };
  if (UO_PROPERTIES.every((x) => rec.filed[x.code]) && !rec.taskTickedAt) {
    const [y, m] = month.split("-").map(Number);
    await markTaskComplete(y, m - 1, UO_TASK_ID, { at: now.toISOString(), by, source: "uo" });
    rec.taskTickedAt = now.toISOString();
  }
  await saveUoMonth(rec);
  return rec;
}

export async function unmarkFiled(month: string, code: string): Promise<UoMonth> {
  const rec = (await getUoMonth(month)) ?? emptyMonth(month);
  delete rec.filed[code];
  await saveUoMonth(rec);
  return rec;
}
