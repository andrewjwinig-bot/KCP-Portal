// THE 10/19/26 REPAIR (owner: "go ahead with the allocation repair … i just
// kept the september invoices in Avid so i think we just need to proceed
// fresh"). A trailing-twelve 2000 GL (Oct 2025 – Sep 2026) was imported; Oct,
// Nov and Dec 2025 had been billed before the portal kept a ledger, so they
// were billed again, and December's year-end sweep billed every balance held
// through August 2026 on the December invoices. The owner deleted the 2025
// invoices in AvidXchange and KEPT September's, so September stands as sent.
//
// What the repair does — previewed first, applied once:
//   1. backs the ledger up;
//   2. puts the swept balances back on hold (`restoreHeld`): Jan–Aug 2026
//      replayed from the GL from an empty carryover — the same compute and
//      $100 rule a send runs — gives what was held at the end of August;
//   3. makes the record say what reached Avid: the send reads "September
//      2026" with September's invoices only, the runs logged for Oct–Dec 2025
//      go, and the AP Outbox entry carries September's count and total.
// Oct–Dec 2025 STAY closed on the ledger — they were billed in 2025.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { emptyLedger, finalizeMonth, priorForProperty, type PropertyCarry } from "./carryover";
import { getAllocLedger, saveAllocLedger, backupAllocLedger } from "./carryoverStore";
import { computeOneMonth, loadSendGl, splitIntoMonths } from "./autoProcess";
import { listPendingSends, type PendingSend } from "./pendingSendStore";
import { getInvoiceArchive, saveInvoiceArchive } from "./invoiceArchive";
import { listAllocationRuns, removeAllocationRuns, type AllocationRun } from "./runStore";
import { getAvidSend, recordAvidSend } from "@/lib/invoicing/avidSendLog";
import { periodKey } from "@/lib/invoicing/unsent";
import { restoreHeld } from "./restoreHeld";
import { PROPERTY_DEFS } from "@/lib/properties/data";

const MARK_PREFIX = "alloc-repairs";
const MARK_ID = "2026-10-19";
const KEPT = "2026-09";
const VOIDED = ["2025-10", "2025-11", "2025-12"];
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const nameOf = (id: string) => PROPERTY_DEFS.find((p) => p.id === id)?.name ?? id;

export type RepairPlan = {
  applied: false;
  period: string;
  sentAt: string | null;
  invoicesKept: number;
  invoicesVoided: number;
  keptTotal: number | null;
  /** Balances going back on hold, by property (the August carryover). */
  restore: { code: string; name: string; amount: number; accounts: { code: string; name: string; amount: number }[] }[];
  restoreTotal: number;
  /** Held today, before the repair (September's small amounts). */
  heldNow: number;
  runsToRemove: number;
};
export type RepairState = RepairPlan | { applied: true; appliedAt: string; appliedBy: string | null; restoreTotal: number; backup: string } | { applied: false; none: true; reason: string };

function incidentSend(all: PendingSend[]): PendingSend | null {
  return all.find((p) => p.source === "allocated" && p.sentAt?.startsWith("2026-10-19")
    && ((p.billedMonths ?? []).some((m) => VOIDED.includes(m)) || /^2025-1/.test(p.period))) ?? null;
}

const isVoidedRun = (r: AllocationRun) => VOIDED.includes(periodKey(r.statementMonth || r.periodText)) && (r.ranAt || "").startsWith("2026-10-19");

async function work() {
  const pending = incidentSend(await listPendingSends());
  if (!pending) return { error: "The 10/19 send is not on record." } as const;
  const gl = await loadSendGl(pending.period, pending);
  if (!gl) return { error: "The GL behind the 10/19 send is no longer on file." } as const;
  const parts = splitIntoMonths(gl).filter((p) => p.statementMonth >= "2026-01" && p.statementMonth <= "2026-08")
    .sort((a, b) => a.statementMonth.localeCompare(b.statementMonth));
  if (parts[0]?.statementMonth !== "2026-01") return { error: "The 10/19 GL doesn't cover January 2026, so August's carryover can't be replayed." } as const;
  let replay = emptyLedger();
  for (const part of parts) {
    const c = computeOneMonth(part, replay);
    if ("error" in c) return { error: c.error } as const;
    replay = finalizeMonth(replay, part.statementMonth, c.expenses, "replay").ledger;
  }
  const held: Record<string, PropertyCarry> = replay.balances;
  const [ledger, archive, runs] = await Promise.all([getAllocLedger(), getInvoiceArchive(pending.period), listAllocationRuns()]);
  const kept = (archive?.invoices ?? []).filter((i) => i.fileName.startsWith(`${KEPT}/`));
  const sepRun = runs.find((r) => periodKey(r.statementMonth || r.periodText) === KEPT && (r.ranAt || "").startsWith("2026-10-19")) ?? null;
  return { pending, held, ledger, archive, kept, sepRun, runs };
}

export async function repairState(): Promise<RepairState> {
  const mark = (await getJSON(MARK_PREFIX, MARK_ID)) as { appliedAt: string; appliedBy: string | null; restoreTotal: number; backup: string } | null;
  if (mark) return { applied: true, ...mark };
  const w = await work();
  if ("error" in w) return { applied: false, none: true, reason: w.error! };
  const restore = Object.values(w.held).map((pc) => {
    const accounts = Object.values(pc.accounts).map((a) => ({ code: a.accountCode, name: a.accountName, amount: round2(a.heldTotal) }))
      .filter((a) => Math.abs(a.amount) >= 0.005).sort((a, b) => b.amount - a.amount);
    return { code: pc.propertyId, name: nameOf(pc.propertyId), amount: round2(accounts.reduce((s, a) => s + a.amount, 0)), accounts };
  }).filter((r) => r.accounts.length).sort((a, b) => b.amount - a.amount);
  return {
    applied: false,
    period: w.pending.period,
    sentAt: w.pending.sentAt ?? null,
    invoicesKept: w.kept.length,
    invoicesVoided: (w.archive?.invoices.length ?? 0) - w.kept.length,
    keptTotal: w.sepRun?.total ?? null,
    restore,
    restoreTotal: round2(restore.reduce((s, r) => s + r.amount, 0)),
    heldNow: round2(Object.keys(w.ledger.balances).reduce((s, pid) => s + priorForProperty(w.ledger, pid), 0)),
    runsToRemove: w.runs.filter(isVoidedRun).length,
  };
}

export async function applyRepair(by: string | null): Promise<RepairState | { error: string }> {
  if (await getJSON(MARK_PREFIX, MARK_ID)) return { error: "The repair has already been applied." };
  const w = await work();
  if ("error" in w) return { error: w.error! };
  const nowISO = new Date().toISOString();

  const backup = await backupAllocLedger(w.ledger, nowISO.replace(/[^0-9]/g, "").slice(0, 14));
  const fixed = restoreHeld(w.ledger, w.held, nowISO);
  await saveAllocLedger(fixed);

  const keptTotal = w.sepRun?.total ?? null;
  // Written directly: savePendingSend keeps a sent record exactly as it is.
  const q = (await getJSON("invoicer-pending-sends", "queue")) as { items?: Record<string, PendingSend> } | null;
  const items = { ...(q?.items ?? {}) };
  items[`allocated:${w.pending.period}`] = {
    ...w.pending,
    label: "September 2026",
    billedLabel: "September 2026",
    billedMonths: [KEPT],
    summary: {
      ...w.pending.summary,
      ...(w.sepRun?.byProperty ? { byProperty: w.sepRun.byProperty } : {}),
      ...(keptTotal != null ? { total: keptTotal } : {}),
      invoiceCount: w.kept.length,
    },
  };
  await storeJSON("invoicer-pending-sends", "queue", { items });

  if (w.archive) await saveInvoiceArchive({ ...w.archive, invoices: w.kept });
  await removeAllocationRuns(isVoidedRun);
  const log = await getAvidSend("allocated", w.pending.period);
  if (log) {
    await recordAvidSend({
      ...log, invoiceCount: w.kept.length,
      propertyCount: new Set(w.kept.map((i) => i.propertyLabel)).size,
      total: keptTotal ?? log.total,
    });
  }
  const restoreTotal = round2(Object.keys(w.held).reduce((s, pid) => s + priorForProperty({ ...emptyLedger(), balances: w.held }, pid), 0));
  const mark = { appliedAt: nowISO, appliedBy: by, restoreTotal, backup };
  await storeJSON(MARK_PREFIX, MARK_ID, mark);
  return { applied: true, ...mark };
}
