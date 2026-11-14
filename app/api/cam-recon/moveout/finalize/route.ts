import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, USERS, type UserId } from "@/lib/users";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { getCloseOut, markApproved, upsertCloseOut, closeOutKey } from "@/lib/cam/moveout/queue";
import { computeMoveoutStatement, moveoutBalance, moveoutOk } from "@/lib/cam/moveout/compute";
import { buildMoveoutPdf, buildMoveoutGlCsv, moveoutGlRows, moveoutEffectiveDate, moveoutFileBase } from "@/lib/cam/moveout/artifacts";
import { moveoutSettlement } from "@/lib/cam/moveout/deposit";
import { chargesEmail } from "@/lib/cam/moveout/emails";
import { recordMoveoutSend } from "@/lib/cam/moveout/sendLog";
import { isConfirmedGone } from "@/lib/leasing/recentlyVacated";
import { APPROVER, MOVEOUT_CHARGES_NAME, moveoutChargesTo } from "@/lib/cam/moveout/recipients";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FROM = "dwinig@kormancommercial.com";

async function currentUserLabel(): Promise<string | undefined> {
  const secret = process.env.SITE_AUTH_SECRET;
  if (!secret) return undefined;
  const token = (await cookies()).get(SITE_COOKIE)?.value;
  const id = await verifySiteToken(token, secret);
  return id && (ALL_USERS as readonly string[]).includes(id) ? USERS[id as UserId].label : undefined;
}

/**
 * POST { key } — approve & finalize a ready move-out close-out (the one human
 * touch). Re-computes the statement fresh (the GL may have moved), refuses if
 * it's no longer fully posted, then produces the final statement PDF + the
 * Skyline GL adjustment and emails the CHARGES to Tanya to post to the
 * tenant's account (cc the approver — office → Nancy, retail → Harry). Records the finalize in the
 * move-out send log and flips the queue entry to `approved`.
 */
export async function POST(req: Request) {
  let body: { key?: string; property?: string; unitRef?: string; year?: number | string; asOf?: number | string } = {};
  try { body = await req.json(); } catch { /* empty ok */ }

  // Resolve the target either from a queue key (dashboard card) or from the
  // property/unitRef/year the interim page holds (a statement opened straight
  // from the approval email, before the watcher may have staged an entry).
  let property = "", unitRef = "", year = 0, vacateMonth: number | undefined;
  if (typeof body.key === "string" && body.key) {
    const entry = await getCloseOut(body.key);
    if (entry) {
      if (entry.status === "approved") return NextResponse.json({ ok: true, alreadyApproved: true, entry });
      ({ property, unitRef, year } = entry);
      vacateMonth = entry.vacateMonth;
    }
  }
  if (!property) {
    property = typeof body.property === "string" ? body.property : "";
    unitRef = typeof body.unitRef === "string" ? body.unitRef : "";
    year = Number(body.year) || 0;
    vacateMonth = Number(body.asOf) || undefined;
  }
  if (!property || !unitRef || !year) {
    return NextResponse.json({ error: "Provide a close-out key, or property + unitRef + year." }, { status: 400 });
  }
  const key = closeOutKey(property, unitRef, year);
  const already = await getCloseOut(key);
  if (already?.status === "approved") return NextResponse.json({ ok: true, alreadyApproved: true, entry: already });

  // A close-out needs a CONFIRMED move-out — gone from the newest rent roll
  // covering the property. Without this a renewed tenant (still on the roll,
  // lease date passed) could be finalized from the interim page, mailing the
  // approver a GL adjustment and a deposit release. Fails closed.
  // Re-compute from source so we finalize the current numbers, not a stale snapshot.
  const c = await computeMoveoutStatement(property, year, unitRef, vacateMonth);
  if (!moveoutOk(c)) return NextResponse.json({ error: c.error }, { status: 409 });
  const gone = await isConfirmedGone(property, unitRef, c.meta.name).catch(() => null);
  if (gone == null) return NextResponse.json({ error: "Couldn't confirm the move-out against the rent roll — try again." }, { status: 503 });
  if (!gone) {
    return NextResponse.json({ error: `${unitRef} is still on the newest rent roll — renewed or holding over, so not a move-out. Finalize once a rent roll no longer shows them.` }, { status: 409 });
  }
  if (c.result.unpostedMonths > 0 || c.result.occupiedMonths <= 0) {
    return NextResponse.json({
      error: `Not ready to finalize — ${c.result.unpostedMonths} occupied month(s) aren't posted to the GL yet.`,
    }, { status: 409 });
  }

  const by = await currentUserLabel();
  const balance = moveoutBalance(c);
  const settlement = await moveoutSettlement(unitRef, c.meta.name, year, balance);
  const dep = settlement.deposit;
  const effectiveDate = moveoutEffectiveDate(c);
  const pdf = buildMoveoutPdf(c, settlement);
  const glCsv = buildMoveoutGlCsv(c, effectiveDate);
  const glRows = moveoutGlRows(c, effectiveDate).filter((r) => r.amount !== 0);
  const base = moveoutFileBase(c);
  const cats = c.kind === "retail" ? "CAM/INS/RET" : "CAM/RET";

  // Once approved, the CHARGES go to Tanya, who posts them to the tenant's
  // account in Skyline (owner: "tanya processes the charges once approved");
  // the approver is cc'd so she has the record of what she approved.
  const chargesTo = moveoutChargesTo();
  let emailed = false;
  if (isMailConfigured()) {
    const mail = chargesEmail({
      name: c.meta.name, suite: c.result.suite, unitRef: c.meta.unitRef, propertyName: c.meta.propertyName,
      leaseTo: c.meta.leaseTo, asOfMonth: c.meta.asOfMonth, year: c.meta.year, cats, settlement,
      approverFirst: APPROVER[c.kind].first, chargesName: MOVEOUT_CHARGES_NAME,
      path: `/cam-recon/interim?property=${encodeURIComponent(property)}&unitRef=${encodeURIComponent(unitRef)}&year=${year}&asOf=${c.meta.asOfMonth}`,
      sentBy: already?.notifiedBy ?? undefined, sentAt: already?.notifiedAt ? new Date(already.notifiedAt) : undefined,
      approvedBy: by, approvedAt: new Date(),
      charges: glRows.map((r) => ({ description: r.chargeDescription, code: r.chargeCode, amount: r.amount })),
      effectiveDate, hasCsv: glRows.length > 0,
    });

    const attachments = [{ name: `${base}.pdf`, content: pdf, contentType: "application/pdf" }];
    if (glRows.length) attachments.push({ name: `${base}_GL.csv`, content: Buffer.from(glCsv, "utf8"), contentType: "text/csv" });
    emailed = await sendMail({
      to: chargesTo,
      cc: APPROVER[c.kind].email,
      from: FROM,
      subject: mail.subject,
      textBody: mail.text,
      htmlBody: mail.html,
      noLinkTracking: true,
      attachments,
    }).catch(() => false);
  }

  // Make sure the queue entry exists (a statement finalized straight from the
  // email may not have been staged yet), then flip it to approved.
  await upsertCloseOut(key, {
    property, unitRef, year, propertyName: c.meta.propertyName, suite: c.result.suite,
    name: c.meta.name, kind: c.kind, vacateMonth: c.meta.asOfMonth, leaseTo: c.meta.leaseTo,
    status: "ready", balance, occupiedMonths: c.result.occupiedMonths, unpostedMonths: 0,
    maxPosted: c.meta.maxPosted, deposit: dep, openAr: settlement.openAr, totalDue: settlement.totalDue,
    ...(emailed ? { chargesSentTo: chargesTo, chargesSentAt: new Date().toISOString() } : {}),
  });
  await markApproved(key, by ?? null);
  await recordMoveoutSend({
    key, property: c.meta.property, propertyName: c.meta.propertyName, unitRef: c.meta.unitRef,
    name: c.meta.name, kind: c.kind, year: c.meta.year, balance,
    deposit: dep?.amount ?? null, net: dep?.net ?? null,
    finalizedAt: new Date().toISOString(), finalizedBy: by ?? null, glRows: glRows.length, emailed,
  }).catch(() => {});

  return NextResponse.json({ ok: true, emailed, chargesTo, mailConfigured: isMailConfigured(), balance, glRows: glRows.length, effectiveDate });
}
