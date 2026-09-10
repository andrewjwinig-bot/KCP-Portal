import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SITE_COOKIE, verifySiteToken } from "@/lib/site-auth";
import { ALL_USERS, USERS, type UserId } from "@/lib/users";
import { sendMail, isMailConfigured } from "@/lib/mail";
import { getCloseOut, markApproved, upsertCloseOut, closeOutKey } from "@/lib/cam/moveout/queue";
import { computeMoveoutStatement, moveoutBalance, moveoutOk } from "@/lib/cam/moveout/compute";
import { buildMoveoutPdf, buildMoveoutGlCsv, moveoutGlRows, moveoutEffectiveDate, moveoutFileBase } from "@/lib/cam/moveout/artifacts";
import { tenantDepositSettlement } from "@/lib/cam/moveout/deposit";
import { recordMoveoutSend } from "@/lib/cam/moveout/sendLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FROM = "dwinig@kormancommercial.com";
const APPROVER = { office: "nfox@kormancommercial.com", retail: "hfeldman@kormancommercial.com" } as const;
const CC_USER = "andrewjwinig@gmail.com";
const money0 = (n: number) => "$" + Math.abs(Math.round(Number(n) || 0)).toLocaleString("en-US");

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
 * Skyline GL adjustment and emails the post-approval package to the approver
 * (office → Nancy, retail → Harry, cc the user). Records the finalize in the
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

  // Re-compute from source so we finalize the current numbers, not a stale snapshot.
  const c = await computeMoveoutStatement(property, year, unitRef, vacateMonth);
  if (!moveoutOk(c)) return NextResponse.json({ error: c.error }, { status: 409 });
  if (c.result.unpostedMonths > 0 || c.result.occupiedMonths <= 0) {
    return NextResponse.json({
      error: `Not ready to finalize — ${c.result.unpostedMonths} occupied month(s) aren't posted to the GL yet.`,
    }, { status: 409 });
  }

  const by = await currentUserLabel();
  const balance = moveoutBalance(c);
  const dep = await tenantDepositSettlement(unitRef, c.meta.name, balance);
  const effectiveDate = moveoutEffectiveDate(c);
  const pdf = buildMoveoutPdf(c);
  const glCsv = buildMoveoutGlCsv(c, effectiveDate);
  const glRows = moveoutGlRows(c, effectiveDate).filter((r) => r.amount !== 0);
  const base = moveoutFileBase(c);
  const cats = c.kind === "retail" ? "CAM/INS/RET" : "CAM/RET";
  const owed = balance >= 0;

  // Post-approval package → the approver (posts Skyline + releases the deposit), cc the user.
  let emailed = false;
  if (isMailConfigured()) {
    const lines: string[] = [];
    lines.push(`${c.meta.name} (Suite ${c.result.suite}, ${c.meta.property} — ${c.meta.propertyName}) — final move-out ${cats} reconciliation ${by ? `approved by ${by}` : "approved"}.`);
    lines.push("");
    lines.push(`Reconciliation: ${money0(balance)} ${owed ? "due from the tenant" : "credit to the tenant"}`);
    if (dep && dep.net != null) {
      lines.push(`Security deposit: ${money0(dep.amount)} on file`);
      lines.push(`Net settlement: ${money0(dep.net)} ${dep.net >= 0 ? "to be refunded to the tenant" : "still due from the tenant"}`);
    }
    lines.push("");
    lines.push(`Attached:`);
    lines.push(`  • Final statement PDF (send to the tenant / keep on file)`);
    lines.push(`  • Skyline GL adjustment (${glRows.length} row${glRows.length === 1 ? "" : "s"}, effective ${effectiveDate}) — import to post the true-up`);
    lines.push("");
    lines.push(`— KCP Portal`);

    emailed = await sendMail({
      to: APPROVER[c.kind],
      cc: CC_USER,
      from: FROM,
      subject: `Move-out finalized — ${c.meta.name} (${c.meta.property} ${c.meta.unitRef}) — ${money0(balance)} ${owed ? "due" : "credit"}`,
      textBody: lines.join("\n"),
      attachments: [
        { name: `${base}.pdf`, content: pdf, contentType: "application/pdf" },
        { name: `${base}_GL.csv`, content: Buffer.from(glCsv, "utf8"), contentType: "text/csv" },
      ],
    }).catch(() => false);
  }

  // Make sure the queue entry exists (a statement finalized straight from the
  // email may not have been staged yet), then flip it to approved.
  await upsertCloseOut(key, {
    property, unitRef, year, propertyName: c.meta.propertyName, suite: c.result.suite,
    name: c.meta.name, kind: c.kind, vacateMonth: c.meta.asOfMonth, leaseTo: c.meta.leaseTo,
    status: "ready", balance, occupiedMonths: c.result.occupiedMonths, unpostedMonths: 0,
    maxPosted: c.meta.maxPosted, deposit: dep,
  });
  await markApproved(key, by ?? null);
  await recordMoveoutSend({
    key, property: c.meta.property, propertyName: c.meta.propertyName, unitRef: c.meta.unitRef,
    name: c.meta.name, kind: c.kind, year: c.meta.year, balance,
    deposit: dep?.amount ?? null, net: dep?.net ?? null,
    finalizedAt: new Date().toISOString(), finalizedBy: by ?? null, glRows: glRows.length, emailed,
  }).catch(() => {});

  return NextResponse.json({ ok: true, emailed, mailConfigured: isMailConfigured(), balance, glRows: glRows.length, effectiveDate });
}
