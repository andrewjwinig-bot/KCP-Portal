// The Aging Report (Skyline → Credit Balance, "Any With Open Credits") and the
// Open Credits page. Behind /tenant-statements by the middleware, inside Tami's
// write scope.
//
//   GET                      → every tenant carrying a credit on the newest report,
//                              itemized, with the last credit notice and the follow-up note
//   GET ?draft=1&unit=       → the open-credit notice for that tenant, drafted, with recipients
//   POST (multipart, file)   → import a report
//   POST { action: "notice", unitRef, subject, opening, closing, exclude? }
//                            → email it (the table is re-rendered from the stored report),
//                              Bcc Tami, record it on the tenant's correspondence

import { NextRequest, NextResponse } from "next/server";
import { currentAging, importAging } from "@/lib/statements/agingStore";
import { agingLookup, creditLinesOf, daysOpen, type CurrentAgingTenant } from "@/lib/statements/aging";
import { creditNoticeParts, creditNoticeTableHtml, creditTotals, nextMonthLabel, renderCreditNotice } from "@/lib/statements/creditNotice";
import { allCorrespondence, newCorrespondenceId, recordTenantEmail } from "@/lib/statements/correspondenceStore";
import { creditNotes } from "@/lib/statements/creditNoteStore";
import { signatureHtml } from "@/lib/emailSignature";
import { arSigner, propertyLabel, sendFromAr, suiteRecipients } from "@/lib/statements/tenantMail";
import { isMailConfigured } from "@/lib/mail";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function who(): Promise<string | null> {
  const u = await budgetUser();
  return u ? USERS[u]?.label ?? u : null;
}
const money2 = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function tenantOf(unit: string): Promise<CurrentAgingTenant | null> {
  const hit = agingLookup(await currentAging(), unit);
  return hit.kind === "found" ? hit.tenant : null;
}

async function draftFor(t: CurrentAgingTenant) {
  const parts = creditNoticeParts({
    tenantName: t.tenantName, propertyName: propertyLabel(t.propertyCode), suite: t.suite, lines: t.lines,
    asOfISO: t.asOf, nextRentMonth: nextMonthLabel(t.asOf), signer: await arSigner(t.propertyCode),
  });
  return { ...parts, tableHtml: creditNoticeTableHtml(t.lines, t.asOf), signatureHtml: signatureHtml((await arSigner(t.propertyCode)).signature) };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get("draft")) {
    const t = await tenantOf(q.get("unit") ?? "");
    if (!t) return NextResponse.json({ error: "That tenant is not on the latest Credit Balance report." }, { status: 404 });
    return NextResponse.json({ ok: true, draft: await draftFor(t), recipients: await suiteRecipients(t.unitRef), totals: creditTotals(t.lines) });
  }
  const [aging, corr, notes] = await Promise.all([currentAging(), allCorrespondence().catch(() => []), creditNotes().catch(() => ({}))]);
  const tenants = aging.tenants
    .map((t) => {
      const credits = creditLinesOf(t);
      if (!credits.length) return null;
      const totals = creditTotals(t.lines);
      const mine = corr.filter((e) => e.unitRef.toUpperCase() === t.unitRef.toUpperCase());
      const notice = mine.find((e) => e.kind === "credit-notice") ?? null;
      return {
        unitRef: t.unitRef, tenantName: t.tenantName, propertyCode: t.propertyCode, propertyName: propertyLabel(t.propertyCode),
        suite: t.suite, asOf: t.asOf, contact: t.contact, phone: t.phone, depositsHeld: t.depositsHeld, balanceDue: t.balanceDue,
        tiesOut: t.tiesOut, lines: t.lines, ...totals,
        oldestCredit: credits[0].dateISO, oldestDays: daysOpen(credits[0].dateISO, t.asOf),
        lastNotice: notice ? { sentAt: notice.sentAt, sentBy: notice.sentBy, id: notice.id, source: notice.source } : null,
        lastContact: mine[0] ? { sentAt: mine[0].sentAt, kind: mine[0].kind } : null,
        note: (notes as Record<string, { text: string; by: string | null; at: string }>)[t.unitRef.toUpperCase()] ?? null,
      };
    })
    .filter(Boolean);
  const asOf = Object.values(aging.coverage).sort().pop() ?? null;
  return NextResponse.json({ ok: true, asOf, runAt: aging.tenants.find((t) => t.asOf === asOf)?.runAt ?? null, properties: Object.keys(aging.coverage).length, tenants });
}

export async function POST(req: NextRequest) {
  const by = await who();
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
    try {
      const result = await importAging(Buffer.from(await file.arrayBuffer()), file.name, by);
      await logAudit({ event: "tenant-statements.aging-import", user: by, ip: auditIp(req), detail: `${file.name} · as of ${result.asOf} · ${result.tenants} tenants` });
      return NextResponse.json({ ok: true, result });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that file." }, { status: 400 });
    }
  }

  const b = await req.json().catch(() => ({}));
  if (b?.action !== "notice") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (!isMailConfigured()) return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
  const t = await tenantOf(String(b?.unitRef ?? ""));
  if (!t) return NextResponse.json({ error: "That tenant is not on the latest Credit Balance report." }, { status: 404 });
  const pickedOut = new Set(Array.isArray(b?.exclude) ? b.exclude.map((x: unknown) => String(x).toLowerCase()) : []);
  const to = (await suiteRecipients(t.unitRef)).filter((e) => !pickedOut.has(e.toLowerCase()));
  if (!to.length) return NextResponse.json({ error: "No email on file for this suite — add a contact on the unit page first." }, { status: 400 });
  const subject = typeof b?.subject === "string" ? b.subject.trim().slice(0, 200) : "";
  const opening = typeof b?.opening === "string" ? b.opening.slice(0, 10000) : "";
  const closing = typeof b?.closing === "string" ? b.closing.slice(0, 10000) : "";
  if (!subject || !opening.trim()) return NextResponse.json({ error: "The email has no subject or opening." }, { status: 400 });

  // The table is re-rendered HERE from the stored report.
  const sig = await arSigner(t.propertyCode);
  const { html, text } = renderCreditNotice(t.lines, t.asOf, opening, closing, sig.signature);
  const { result, fromHeader } = await sendFromAr({
    to: to.join(", "), bcc: sig.email, subject, textBody: text, htmlBody: html, headers: [{ Name: "Reply-To", Value: sig.email }],
  }, sig);
  if (!result.ok) return NextResponse.json({ error: `The email did not send: ${result.error ?? "unknown error"}` }, { status: 502 });
  const totals = creditTotals(t.lines);
  await recordTenantEmail({
    id: newCorrespondenceId(t.unitRef), kind: "credit-notice", unitRef: t.unitRef, propertyCode: t.propertyCode, tenantName: t.tenantName,
    sentAt: new Date().toISOString(), sentBy: by, from: fromHeader, to, bcc: sig.email, replyTo: sig.email, subject, text, html,
    messageId: result.messageId ?? null, testMode: !!result.testMode, attachment: null,
    summary: `${money2(totals.credit)} credit`, refId: null, balance: totals.net,
  });
  await logAudit({ event: "tenant-statements.credit-notice", user: by, ip: auditIp(req), detail: `${t.unitRef} · ${money2(totals.credit)} · ${to.length} recipient(s)` });
  return NextResponse.json({ ok: true, to });
}
