import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, USERS, type UserId } from "@/lib/users";
import { isMailConfigured } from "@/lib/mail";
import { getCloseOut, upsertCloseOut, closeOutKey } from "@/lib/cam/moveout/queue";
import { computeMoveoutStatement, moveoutBalance, moveoutOk } from "@/lib/cam/moveout/compute";
import { moveoutSettlement } from "@/lib/cam/moveout/deposit";
import { moveoutCandidates } from "@/lib/cam/moveout/candidates";
import { sendApproval } from "@/lib/cam/moveout/watcher";
import { APPROVER } from "@/lib/cam/moveout/recipients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function currentUserLabel(): Promise<string | undefined> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return undefined;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? USERS[id as UserId].label : undefined;
}

/** GET ?property=&unitRef=&year= — the close-out's approval state for the Final Bill. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const property = u.searchParams.get("property") ?? "", unitRef = u.searchParams.get("unitRef") ?? "";
  const year = Number(u.searchParams.get("year")) || 0;
  if (!property || !unitRef || !year) return NextResponse.json({ entry: null });
  const entry = await getCloseOut(closeOutKey(property, unitRef, year)).catch(() => null);
  return NextResponse.json({ entry });
}

/**
 * POST { property, unitRef, year, asOf } — "Send to Nancy for approval" on the
 * Final Bill (owner: "once i get the final bill … send it to nancy to
 * approve"). The same approval email the daily watcher sends, from the same
 * fresh compute — office → Nancy, retail → Harry, the Final Bill PDF attached
 * — and the queue entry records who sent it, so the watcher never sends a
 * second one. Re-sending is allowed (the bill changed: a re-imported final
 * statement); an approved close-out is not re-sent.
 */
export async function POST(req: Request) {
  let body: { property?: string; unitRef?: string; year?: number | string; asOf?: number | string } = {};
  try { body = await req.json(); } catch { /* empty ok */ }
  const property = typeof body.property === "string" ? body.property : "";
  const unitRef = typeof body.unitRef === "string" ? body.unitRef : "";
  const year = Number(body.year) || 0;
  const asOf = Number(body.asOf) || undefined;
  if (!property || !unitRef || !year) return NextResponse.json({ error: "Provide property, unitRef and year." }, { status: 400 });
  if (!isMailConfigured()) return NextResponse.json({ error: "Mail is not configured — nothing can be sent." }, { status: 503 });

  const key = closeOutKey(property, unitRef, year);
  const prior = await getCloseOut(key);
  if (prior?.status === "approved") return NextResponse.json({ error: "Already approved and finalized." }, { status: 409 });

  // The same gate as finalize: a confirmed move-out, fully posted — Nancy
  // cannot approve anything less, so it is never sent for approval.
  const cands = await moveoutCandidates().catch(() => null);
  if (!cands) return NextResponse.json({ error: "Couldn't confirm the move-out against the rent roll — try again." }, { status: 503 });
  if (!cands.some((x) => x.kind === "vacated" && x.propertyCode.toUpperCase() === property.toUpperCase() && x.unitRef === unitRef)) {
    return NextResponse.json({ error: `${unitRef} is still on the newest rent roll — not a move-out yet.` }, { status: 409 });
  }
  const c = await computeMoveoutStatement(property, year, unitRef, asOf);
  if (!moveoutOk(c)) return NextResponse.json({ error: c.error }, { status: 409 });
  // GL months still unposted do NOT block the send (owner: "the send to nancy
  // button isnt showing for gilson") — she can review the Final Bill now; the
  // email says the GL is short, and Approve & finalize still waits for it.
  if (c.result.occupiedMonths <= 0) return NextResponse.json({ error: "No occupied months to reconcile." }, { status: 409 });

  const by = await currentUserLabel();
  const balance = moveoutBalance(c);
  const settlement = await moveoutSettlement(unitRef, c.meta.name, year, balance);
  const sent = await sendApproval(c, settlement, by).catch(() => false);
  if (!sent) return NextResponse.json({ error: `The email to ${APPROVER[c.kind].first} did not send — try again.` }, { status: 502 });

  const now = new Date().toISOString();
  const entry = await upsertCloseOut(key, {
    property, unitRef, year, propertyName: c.meta.propertyName, suite: c.result.suite,
    name: c.meta.name, kind: c.kind, vacateMonth: c.meta.asOfMonth, leaseTo: c.meta.leaseTo,
    status: c.result.unpostedMonths > 0 ? "waiting" : "ready", balance, occupiedMonths: c.result.occupiedMonths, unpostedMonths: c.result.unpostedMonths,
    maxPosted: c.meta.maxPosted, deposit: settlement.deposit, openAr: settlement.openAr, totalDue: settlement.totalDue,
    readyAt: c.result.unpostedMonths > 0 ? (prior?.readyAt ?? null) : (prior?.readyAt ?? now), notifiedAt: now, notifiedBy: by ?? null,
  });
  return NextResponse.json({ ok: true, to: APPROVER[c.kind].email, approver: APPROVER[c.kind].first, entry });
}
