// Shared security-deposit lookup for a departing tenant — used by the watcher's
// approval email and the finalize step so both net the settlement the same way.

import "server-only";
import { listDeposits } from "@/lib/deposits/storage";
import type { SecurityDeposit } from "@/lib/deposits/deposits";
import type { CloseOutDeposit } from "./queue";
import { sameTenant } from "@/lib/leasing/confirmedMoveouts";
import { allRuns } from "@/lib/statements/store";
import { resolveCurrentRentroll } from "@/lib/rentroll/current";
import { pickOpenAr, totalDue, type MoveoutOpenAr } from "./openAr";
import type { DepositDetail } from "./settlementPdf";
import { get as getBlob } from "@vercel/blob";

/** The departing tenant's deposit. The SUITE alone is not enough: once a
 *  suite is re-leased it holds the new tenant's deposit too, and the close-out
 *  netted against that. So: a deposit on this suite filed under THIS tenant
 *  first; then one filed under their name anywhere (deposits are sometimes
 *  filed under the company, not the unit); then the suite's, when no name is
 *  known or nothing matches it. Prefers one still on file. */
export function pickDeposit(all: SecurityDeposit[], unitRef: string, name: string | undefined): SecurityDeposit | null {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const isTenant = (d: SecurityDeposit) => !!name && (sameTenant(d.tenantCompany, name)
    || n(d.tenantCompany).includes(n(name)) || (n(d.tenantCompany).length >= 8 && n(name).includes(n(d.tenantCompany))));
  const byUnit = all.filter((d) => d.unitRef.toLowerCase() === unitRef.toLowerCase());
  const unitAndName = byUnit.filter(isTenant);
  const byName = all.filter(isTenant);
  const pool = unitAndName.length ? unitAndName : byName.length ? byName : byUnit;
  return pool.find((d) => !d.refunded && !d.tenantDefaulted) ?? pool[pool.length - 1] ?? null;
}

/** Deposit + net-settlement snapshot. `net` (deposit − what the tenant owes:
 *  the true-up plus their open balance) is only meaningful when the deposit is
 *  still applicable (held / partial). */
export function depositSettlement(d: SecurityDeposit | null, balance: number): CloseOutDeposit | null {
  if (!d) return null;
  const status = d.refunded ? "refunded" : d.tenantDefaulted ? "forfeited" : d.partialRefund ? "partial" : "held";
  // A deposit on file with no amount keyed applies nothing — never a $0 credit.
  const applies = (status === "held" || status === "partial") && d.amount > 0;
  return { amount: d.amount, status, net: applies ? d.amount - balance : null };
}


// ── The whole settlement: true-up + open balance − deposit ──────────────────
// The close-out is the tenant's final bill, so the deposit is netted against
// everything they owe — the reconciliation AND the open balance on their
// newest monthly statement (`openAr.ts`) — never the true-up alone.


export type MoveoutSettlement = {
  reconBalance: number;
  /** Null when no monthly statement carries this tenant. */
  openAr: MoveoutOpenAr | null;
  /** reconBalance + the open balance. */
  totalDue: number;
  deposit: CloseOutDeposit | null;
  /** The deposit record behind line 3 — check #, date, notes and the check
   *  image — for the PDF's Security Deposit page. */
  depositDetail?: DepositDetail | null;
};

export async function tenantOpenAr(unitRef: string, name: string | undefined, year: number): Promise<MoveoutOpenAr | null> {
  const [runs, roll] = await Promise.all([allRuns().catch(() => []), resolveCurrentRentroll().catch(() => null)]);
  // Who is in the suite NOW — a re-let suite's statement is never the departed tenant's.
  const now = roll?.properties.flatMap((p) => p.units).find((u) => u.unitRef === unitRef && !u.isVacant);
  return pickOpenAr(runs, unitRef, name, year, now?.occupantName ?? null);
}

/** `deposits` when the caller already holds them (the watcher loads them once
 *  per run); otherwise they are read here. */
export async function moveoutSettlement(
  unitRef: string, name: string | undefined, year: number, reconBalance: number, deposits?: SecurityDeposit[],
): Promise<MoveoutSettlement> {
  const openAr = await tenantOpenAr(unitRef, name, year);
  const due = totalDue(reconBalance, openAr);
  const all = deposits ?? await listDeposits().catch(() => [] as SecurityDeposit[]);
  const picked = pickDeposit(all, unitRef, name);
  return {
    reconBalance, openAr, totalDue: due,
    deposit: depositSettlement(picked, due),
    depositDetail: picked ? await depositDetailOf(picked) : null,
  };
}

/** The record for the PDF's Security Deposit page, with the check image read
 *  from the private blob store when it is a JPEG / PNG (a PDF scan is named). */
export async function depositDetailOf(d: SecurityDeposit): Promise<DepositDetail> {
  const img = d.checkImage;
  const out: DepositDetail = {
    checkNumber: d.checkNumber, checkDate: d.checkDate, notes: d.notes,
    imageName: img?.name ?? null, imageType: img?.contentType ?? null, image: null,
  };
  const format = /png/i.test(img?.contentType ?? "") ? "PNG" : /jpe?g/i.test(img?.contentType ?? "") ? "JPEG" : null;
  if (img && format && process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const r = await getBlob(img.url, { access: "private" });
      if (r) {
        const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
        out.image = { dataUrl: `data:${img.contentType};base64,${buf.toString("base64")}`, format };
      }
    } catch { /* named, not drawn */ }
  }
  return out;
}
