// The move-out watcher — the engine behind "just fire off the final statements
// when they're ready." Runs daily (see /api/cron/moveout-closeouts). For every
// departing tenant it:
//   1. computes their interim statement through the latest POSTED GL month,
//   2. parks it in the close-out queue as `waiting` (GL not fully posted) or
//      `ready` (fully posted — the true-up is final),
//   3. the first time an entry goes `ready`, emails the approver ONE approval
//      request (office → Nancy, retail → Harry, cc the user) with the final
//      statement PDF attached and the security-deposit settlement spelled out.
// Approval itself (the one human touch) happens on the dashboard / interim page
// and is handled by the finalize endpoint — not here.

import "server-only";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { listDeposits } from "@/lib/deposits/storage";
import type { SecurityDeposit } from "@/lib/deposits/deposits";
import { moveoutCandidates } from "./candidates";
import { computeMoveoutStatement, moveoutBalance, moveoutOk, type MoveoutOk } from "./compute";
import { buildMoveoutPdf, moveoutFileBase } from "./artifacts";
import { closeOutKey, upsertCloseOut, getCloseOut, type CloseOutDeposit } from "./queue";
import { pickDeposit, depositSettlement } from "./deposit";

const GL_FROM_YEAR = 2026; // interim recon sources actuals from the imported GL
const PORTAL_BASE = "https://portal.kormancommercial.com";
const FROM = "dwinig@kormancommercial.com"; // verified Postmark sender
const APPROVER: Record<"office" | "retail", { email: string; first: string }> = {
  office: { email: "nfox@kormancommercial.com", first: "Nancy" },
  retail: { email: "hfeldman@kormancommercial.com", first: "Harry" },
};
const CC_USER = "andrewjwinig@gmail.com";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const money0 = (n: number) => "$" + Math.abs(Math.round(Number(n) || 0)).toLocaleString("en-US");

type Ok = MoveoutOk;

/** The one approval email — routed by kind, cc the user, statement PDF attached. */
async function sendApproval(c: Ok, dep: CloseOutDeposit | null): Promise<boolean> {
  const { meta, result } = c;
  const to = APPROVER[c.kind];
  const cats = c.kind === "retail" ? "CAM/INS/RET" : "CAM/RET";
  const movedOut = meta.leaseTo ? `on ${meta.leaseTo}` : `in ${MONTHS[meta.asOfMonth - 1]} ${meta.year}`;
  const balance = moveoutBalance(c);
  const owed = balance >= 0;

  const lines: string[] = [];
  lines.push(`Hi ${to.first},`);
  lines.push("");
  lines.push(`${meta.name} (Suite ${result.suite}, ${meta.property} — ${meta.propertyName}) moved out ${movedOut}. Their final ${cats} reconciliation is ready — please review and approve it.`);
  lines.push("");
  lines.push(`Final ${cats} reconciliation: ${money0(balance)} ${owed ? "due from the tenant" : "credit to the tenant"}`);
  if (dep && dep.net != null) {
    lines.push(`Security deposit on file: ${money0(dep.amount)}${dep.status === "partial" ? " (partially refunded)" : ""}`);
    lines.push(`Net settlement: ${money0(dep.net)} ${dep.net >= 0 ? "to be refunded to the tenant" : "still due from the tenant"}`);
  } else if (dep) {
    lines.push(`Security deposit: ${money0(dep.amount)} — ${dep.status} (not netted into the settlement).`);
  } else {
    lines.push(`No security deposit is on record for this unit.`);
  }
  lines.push("");
  const link = `${PORTAL_BASE}/cam-recon/interim?property=${encodeURIComponent(meta.property)}&unitRef=${encodeURIComponent(meta.unitRef)}&year=${meta.year}&asOf=${meta.asOfMonth}`;
  lines.push(`Review the attached statement and approve it here:`);
  lines.push(link);
  lines.push("");
  lines.push(`Once you approve, the Skyline GL adjustment and the final statement are generated automatically — nothing else needs to be done.`);
  lines.push("");
  lines.push(`— KCP Portal`);

  return sendMail({
    to: to.email,
    cc: CC_USER,
    from: FROM,
    subject: `Approve final move-out statement — ${meta.name} (${meta.property} ${meta.unitRef})`,
    textBody: lines.join("\n"),
    attachments: [{ name: `${moveoutFileBase(c)}.pdf`, content: buildMoveoutPdf(c), contentType: "application/pdf" }],
  });
}

export type WatchResult = {
  checked: number;
  waiting: number;
  ready: number;
  newlyReady: number;
  notified: number;
  mailConfigured: boolean;
  /** False when the deposit store failed to load this run — READY approvals are
   *  deferred rather than sent with a fabricated "no deposit" settlement. */
  depositsLoaded: boolean;
  details: { key: string; name: string; property: string; status: "waiting" | "ready"; balance: number; unpostedMonths: number; notified?: boolean }[];
};

/** Scan every move-out candidate, refresh the queue, and email a one-time
 *  approval request for each newly-ready close-out. `notify:false` stages
 *  without emailing (a dry run). */
export async function runMoveoutWatch(opts?: { notify?: boolean; now?: Date }): Promise<WatchResult> {
  const notify = opts?.notify ?? true;
  const now = opts?.now ?? new Date();
  const cands = await moveoutCandidates(now);
  // A transient failure loading deposits must NOT be treated as "no deposits
  // exist" — that would email the approver a wrong "No security deposit on
  // record" settlement and mark it notified for good. Track the failure and
  // defer the READY approval to the next run instead.
  let deposits: SecurityDeposit[] = [];
  let depositsLoaded = true;
  try {
    deposits = await listDeposits();
  } catch {
    depositsLoaded = false;
  }

  const res: WatchResult = { checked: 0, waiting: 0, ready: 0, newlyReady: 0, notified: 0, mailConfigured: isMailConfigured(), depositsLoaded, details: [] };

  for (const cand of cands) {
    // Need a resolvable vacate month in an auto-sourceable year; otherwise this
    // one is handled manually on the interim page.
    if (cand.year == null || cand.month == null || cand.year < GL_FROM_YEAR) continue;
    const year = cand.year;
    const key = closeOutKey(cand.propertyCode, cand.unitRef, year);
    const prior = await getCloseOut(key);
    if (prior?.status === "approved") continue; // already finalized — leave it

    res.checked++;
    const c = await computeMoveoutStatement(cand.propertyCode, year, cand.unitRef, cand.month);
    const suite = cand.unitRef.split("-").slice(1).join("-");

    if (!moveoutOk(c)) {
      // Not reconcilable via the roster path (not on roster / no config) → skip.
      if (c.status === 404) continue;
      // WAITING — no GL uploaded yet, or none posted through the occupied window.
      res.waiting++;
      const maxPosted = c.meta.maxPosted ?? 0;
      const asOfM = c.meta.asOfMonth ?? cand.month;
      const unposted = Math.max(0, asOfM - maxPosted);
      const name = c.meta.name ?? cand.name;
      await upsertCloseOut(key, {
        property: cand.propertyCode, propertyName: cand.propertyName, unitRef: cand.unitRef, suite,
        name, kind: cand.reconKind, year, vacateMonth: cand.month, leaseTo: cand.leaseTo,
        status: "waiting", balance: 0, occupiedMonths: 0, unpostedMonths: unposted, maxPosted,
      });
      res.details.push({ key, name, property: cand.propertyCode, status: "waiting", balance: 0, unpostedMonths: unposted });
      continue;
    }

    // WAITING — the occupied window is only partially posted (GL posts ~a month
    // in arrears), so the true-up isn't final yet. Stage the running state.
    if (c.result.unpostedMonths > 0 || c.result.occupiedMonths <= 0) {
      res.waiting++;
      await upsertCloseOut(key, {
        property: cand.propertyCode, propertyName: c.meta.propertyName, unitRef: cand.unitRef, suite,
        name: c.meta.name, kind: cand.reconKind, year, vacateMonth: cand.month, leaseTo: cand.leaseTo,
        status: "waiting", balance: moveoutBalance(c), occupiedMonths: c.result.occupiedMonths,
        unpostedMonths: c.result.unpostedMonths, maxPosted: c.meta.maxPosted,
      });
      res.details.push({ key, name: c.meta.name, property: cand.propertyCode, status: "waiting", balance: moveoutBalance(c), unpostedMonths: c.result.unpostedMonths });
      continue;
    }

    // READY — the occupied window is fully posted; the true-up is final.
    res.ready++;
    const balance = moveoutBalance(c);
    const base = {
      property: cand.propertyCode, propertyName: c.meta.propertyName, unitRef: cand.unitRef, suite: c.result.suite,
      name: c.meta.name, kind: cand.reconKind, year, vacateMonth: cand.month, leaseTo: cand.leaseTo,
      status: "ready" as const, balance, occupiedMonths: c.result.occupiedMonths, unpostedMonths: 0, maxPosted: c.meta.maxPosted,
      readyAt: prior?.readyAt ?? now.toISOString(),
    };
    // Only settle + notify when deposits actually loaded. If the store failed
    // this run, stage ready WITHOUT touching the deposit field (the upsert
    // preserves any prior settlement) and leave notifiedAt unset so the next
    // successful run sends the approval with the correct settlement.
    const dep = depositsLoaded ? depositSettlement(pickDeposit(deposits, cand.unitRef, c.meta.name), balance) : null;
    const entry = await upsertCloseOut(key, depositsLoaded ? { ...base, deposit: dep } : base);

    let didNotify = false;
    if (!entry.notifiedAt && depositsLoaded) {
      res.newlyReady++;
      if (notify) {
        const sent = await sendApproval(c, dep).catch(() => false);
        if (sent) {
          await upsertCloseOut(key, { property: cand.propertyCode, unitRef: cand.unitRef, year, notifiedAt: new Date().toISOString() });
          res.notified++;
          didNotify = true;
        }
      }
    }
    res.details.push({ key, name: c.meta.name, property: cand.propertyCode, status: "ready", balance, unpostedMonths: 0, notified: didNotify });
  }

  return res;
}
