// MONTH-END CLOSE — one page that says what is left before a month is closed
// (owner: "i like the closing checklist … i like to know when i need to import
// which files … pending close out progress as well").
//
// Nothing here is keyed. Each line reads the record the portal already keeps
// for that piece of work — the GL schedule, the rent-roll history, the laser
// statement periods, the bank-rec run, the AvidXchange send log and the
// move-out queue — so the checklist ticks itself as the work lands. The one
// stored thing is the sign-off (`month-close/<YYYY-MM>`).
//
// Flags to Investigate is the exception: its sweep runs every month of every
// property and is too slow to run inside this read, so the page asks the
// review route for it separately.

import "server-only";
import { getJSON, listJSON, storeJSON } from "@/lib/storage";
import { outstandingGlUploads } from "@/lib/financials/operating-statements/outstanding";
import { monthlyStatements } from "@/lib/financials/operating-statements/mappingStore";
import { snapshotMonthKey } from "@/lib/rentroll/snapshot";
import { getRun as getStatementRun } from "@/lib/statements/store";
import { runFor as bankRecRun } from "@/lib/bank-rec/store";
import { listAvidSends, type AvidSendEntry } from "@/lib/invoicing/avidSendLog";
import { listCloseOuts, type CloseOut } from "@/lib/cam/moveout/queue";
import { closeMonthOf, payrollSendsIn, quarterOfMonth, sendsForMonth, closeOutStage, type CloseItem, type CloseSection } from "./monthCloseMath";

export type { CloseItem, CloseSection };
export type CloseSignOff = { by: string | null; at: string };
export type MonthClose = {
  month: string;
  label: string;
  sections: CloseSection[];
  /** Items not yet done (Flags excluded — the page counts those). */
  left: number;
  signedOff: CloseSignOff | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthLabel = (m: string) => { const [y, mo] = m.split("-").map(Number); return `${MONTHS[mo - 1]} ${y}`; };
const short = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
};
const money0 = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** The month a close is usually being worked: last month. */
export function defaultCloseMonth(now = new Date()): string {
  return closeMonthOf(now);
}

export async function getSignOff(month: string): Promise<CloseSignOff | null> {
  return (await getJSON("month-close", month)) as CloseSignOff | null;
}
export async function setSignOff(month: string, s: CloseSignOff | null): Promise<void> {
  await storeJSON("month-close", month, s ? s : { cleared: true, at: new Date().toISOString() });
}

export async function buildMonthClose(month: string): Promise<MonthClose> {
  const [y, m] = month.split("-").map(Number);
  const next = (k: number) => { const d = new Date(Date.UTC(y, m - 1 + k, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const nextMonth = next(1);
  // The GL schedule asks "what is owed as of a date". The 25th of the month
  // after is past every due day, so it owes exactly this month (and the
  // quarter end, for the land holdings).
  const asOf = new Date(Date.UTC(y, m, 25, 12));

  const [gl, mappings, rollSnaps, stmtRun, recRun, sends, closeOuts, signRaw] = await Promise.all([
    outstandingGlUploads(asOf).catch(() => null),
    monthlyStatements().catch(() => []),
    listJSON("rentroll-history", { fresh: true }).catch(() => []),
    getStatementRun(nextMonth).catch(() => null),
    bankRecRun(month).catch(() => null),
    listAvidSends(400).catch(() => [] as AvidSendEntry[]),
    listCloseOuts().catch(() => [] as CloseOut[]),
    getSignOff(month).catch(() => null),
  ]);

  // ── Imports ──────────────────────────────────────────────────────────────
  const imports: CloseItem[] = [];
  {
    const total = mappings.length;
    const behind = gl?.behind ?? [];
    imports.push({
      id: "gl", label: "General Ledger", owner: "Drew", due: `By ${MONTHS[m % 12].slice(0, 3)} 20`,
      link: "/financials/operating-statements",
      done: gl != null && behind.length === 0,
      status: gl == null ? "Couldn't read" : behind.length ? `${total - behind.length} of ${total} in` : `All ${total} in`,
      detail: behind.map((b) => ({ text: `${b.propertyCode} ${b.name}`, meta: b.latest ? `through ${MONTHS[b.latest.period - 1].slice(0, 3)} ${b.latest.year}` : "nothing imported" })),
    });
  }
  {
    const months = new Set((rollSnaps as { reportTo?: string | null; uploadedAt?: string | null }[]).map((s) => snapshotMonthKey(s)));
    const has = months.has(month) || months.has(nextMonth);
    imports.push({
      id: "rentroll", label: "Rent Roll", owner: "Drew", due: `By ${MONTHS[m % 12].slice(0, 3)} 1`,
      link: "/rentroll", done: has, status: has ? "Imported" : "Not imported", detail: [],
    });
  }
  {
    const s = stmtRun as { updatedAt?: string; statements?: unknown[] } | null;
    const has = !!s && (s.statements?.length ?? 0) > 0;
    imports.push({
      id: "laser", label: `Laser Statement · ${MONTHS[m % 12].slice(0, 3)} 1`, owner: "Drew", due: `By ${MONTHS[m % 12].slice(0, 3)} 5`,
      link: "/tenant-statements", done: has, status: has ? `Imported ${short(s!.updatedAt)}` : "Not imported", detail: [],
    });
  }
  {
    const r = recRun;
    const accounts = (r?.accounts ?? []).filter((a) => !a.na);
    const ok = accounts.filter((a) => a.rec?.status === "ok" || a.rec?.status === "attention");
    const bad = accounts.filter((a) => !(a.rec?.status === "ok" || a.rec?.status === "attention"));
    const signed = !!r?.signedOff;
    imports.push({
      id: "bankrec", label: "Bank Recs", owner: "Drew", due: "After statements post",
      link: "/bank-rec/reconcile",
      done: !!r && (signed || (accounts.length > 0 && bad.length === 0)),
      status: !r ? "Not started" : signed ? `Signed off ${short(r.signedOff!.at)}` : `${ok.length} of ${accounts.length} in balance`,
      detail: bad.map((a) => ({
        text: `${a.bank} x${a.last4} ${a.name}`,
        meta: !a.rec ? "no statement" : a.rec.status === "out" ? "out of balance" : a.rec.status === "incomplete" ? "missing a file" : a.rec.status,
      })),
    });
  }

  // ── Sent to AvidXchange ─────────────────────────────────────────────────
  const avid: CloseItem[] = [];
  {
    const alloc = sendsForMonth(sends, "allocated", month);
    avid.push({
      id: "allocated", label: "Allocated Expenses", owner: "Automatic", due: "On the 2000 GL import",
      link: "/allocated-invoicer", done: alloc.length > 0,
      status: alloc.length ? `Sent ${short(alloc[0].sentAt)} · ${money0(alloc[0].total)}` : "Not sent", detail: [],
    });
  }
  {
    const cc = sendsForMonth(sends, "credit-card", month);
    avid.push({
      id: "cc", label: "Credit Card", owner: "Harry", due: "At monthly close",
      link: "/expenses", done: cc.length > 0,
      status: cc.length ? `Sent ${short(cc[0].sentAt)} · ${money0(cc[0].total)}` : "Waiting on Harry", detail: [],
    });
  }
  {
    const pr = payrollSendsIn(sends, month);
    avid.push({
      id: "payroll", label: "Payroll", owner: "Harry", due: "Each pay period",
      link: "/", done: pr.length >= 2,
      status: pr.length ? `${pr.length} pay period${pr.length === 1 ? "" : "s"} sent` : "None sent",
      detail: pr.map((p) => ({ text: `Pay date ${p.period}`, meta: `sent ${short(p.sentAt)} · ${money0(p.total)}` })),
    });
  }
  const q = quarterOfMonth(month);
  if (q) {
    const cm = sends.filter((s) => s.source === "commissions" && q.re.test(s.period));
    avid.push({
      id: "commissions", label: `Commissions · ${q.label}`, owner: "Automatic", due: "Morning after quarter end",
      link: "/commissions", done: cm.length > 0,
      status: cm.length ? `Sent ${short(cm[0].sentAt)}` : "Not sent", detail: [],
    });
  }

  // ── Move-outs ───────────────────────────────────────────────────────────
  const pending = closeOuts.filter((c) => !(c.status === "approved" && c.chargesSentAt));
  const moveouts: CloseItem[] = [{
    id: "closeouts", label: "Move-out close-outs", owner: "Drew, then Nancy or Harry, then Tanya", due: "",
    link: "/cam-recon/interim", done: pending.length === 0,
    status: pending.length ? `${pending.length} open` : "None open",
    detail: pending
      .sort((a, b) => closeOutStage(a).rank - closeOutStage(b).rank)
      .map((c) => {
        const st = closeOutStage(c);
        return {
          text: `${c.name} · ${c.unitRef}`,
          meta: st.text,
          href: `/cam-recon/interim?property=${encodeURIComponent(c.property)}&unitRef=${encodeURIComponent(c.unitRef)}&year=${c.year}`,
          tone: st.tone,
        };
      }),
  }];

  const sections: CloseSection[] = [
    { id: "imports", label: "Imports & reconciliations", items: imports },
    { id: "review", label: "Review", items: [], flags: true },
    { id: "avid", label: "Sent to AvidXchange", items: avid },
    { id: "moveouts", label: "Move-outs", items: moveouts },
  ];
  const left = sections.flatMap((s) => s.items).filter((i) => !i.done).length;
  const signedOff = signRaw && (signRaw as { by?: unknown }).by !== undefined && !(signRaw as { cleared?: boolean }).cleared
    ? (signRaw as CloseSignOff) : null;
  return { month, label: monthLabel(month), sections, left, signedOff };
}
