// Receipt Reconciliation API — behind /tenant-statements by the middleware
// (`/api/tenant-statements` → the Monthly Statements page), and inside Tami's
// write scope.
//
//   GET  ?period=                → the month's tenants (for the picker), every receipt record
//                                   and the archive of every receipt email sent
//   GET  ?email=<id>[&format=eml|pdf] → one sent email exactly as it went (JSON),
//                                   as an .eml file, or its attached statement
//   GET  ?period=&unit=&amount=  → that tenant's account, the explanations of the amount,
//                                   who the email goes to, and the drafted email for `plan`
//   POST { action: "send", … }   → recompute the chosen plan from the STORED statement,
//                                   email the tenant, save the record (waiting)
//   POST { action: "draft", … }  → save without emailing
//   POST { action: "confirm", id, plan?, note }  → the tenant answered; confirm a plan
//   POST { action: "posted" | "unposted", id }   → keyed in Skyline (or undo)
//   DELETE { id }
//
// Every figure that is sent or saved is re-derived on the server — a client
// plan is never what a payment is applied against.

import { NextRequest, NextResponse } from "next/server";
import { allRuns, getRun } from "@/lib/statements/store";
import { accountOf, explainPayment, planById, receiptEmailParts, receiptTableHtml, renderReceiptEmail, respondByFrom, type Explanation } from "@/lib/statements/receiptMatch";
import { allReceipts, deleteReceipt, getReceipt, receiptStatus, saveReceipt, todayET, type ReceiptRec } from "@/lib/statements/receiptStore";
import { isMailConfigured } from "@/lib/mail";
import type { EmailSignature } from "@/lib/emailSignature";
import { arSigner, propertyLabel, sendFromAr, statementPdf, suiteRecipients } from "@/lib/statements/tenantMail";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";
import { logAudit, auditIp } from "@/lib/audit";
import type { TenantStatement } from "@/lib/statements/types";
import { allSentEmails, getSentEmail, recordSentEmail, summarizeSent, type SentReceiptEmail } from "@/lib/statements/receiptEmailLog";
import { toEml } from "@/lib/statements/receiptEml";
import { currentAging } from "@/lib/statements/agingStore";
import { agingLookup, statementFromAging } from "@/lib/statements/aging";
import { laserDate, statementForReceipt, statementOf } from "@/lib/statements/currentAccount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const propertyName = propertyLabel;
const money = (n: unknown) => { const v = Math.round(Number(n) * 100) / 100; return Number.isFinite(v) ? v : NaN; };
const isISO = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function latestPeriod(): Promise<string | null> {
  const runs = await allRuns();
  return runs.map((r) => r.period).sort().pop() ?? null;
}

/** When the figures are true as of: Skyline's export time (the workbook's own
 *  stamp, `exportedAt`) — NOT the day it was imported into the portal, which
 *  can be days later. Imports before the stamp was read have only the import. */
const recipientsFor = suiteRecipients;
const signer = arSigner;

async function who(): Promise<string | null> {
  const u = await budgetUser();
  return u ? USERS[u]?.label ?? u : null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const emailId = q.get("email");
  if (emailId) {
    const e = await getSentEmail(emailId);
    if (!e) return NextResponse.json({ error: "That email is not on file." }, { status: 404 });
    const safe = (s: string) => s.replace(/[^\w]+/g, "_");
    const format = q.get("format");
    if (format === "eml") {
      return new NextResponse(toEml(e), { headers: {
        "Content-Type": "message/rfc822", "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${safe(e.tenantName)}_${e.sentAt.slice(0, 10)}_receipt_email.eml"`,
      } });
    }
    if (format === "pdf") {
      if (!e.attachment) return NextResponse.json({ error: "No statement was attached to that email." }, { status: 404 });
      return new NextResponse(Buffer.from(e.attachment.base64, "base64"), { headers: {
        "Content-Type": e.attachment.contentType, "Cache-Control": "no-store", "Content-Disposition": `inline; filename="${e.attachment.name}"`,
      } });
    }
    return NextResponse.json({ ok: true, email: { ...summarizeSent(e), html: e.html, text: e.text } });
  }
  const period = q.get("period") || (await latestPeriod());
  if (!period) return NextResponse.json({ ok: true, period: null, periods: [], tenants: [], receipts: [], sentEmails: await allSentEmails() });
  const unit = q.get("unit");

  if (!unit) {
    const [run, runs, receipts, sentEmails, aging] = await Promise.all([getRun(period), allRuns(), allReceipts(), allSentEmails(), currentAging()]);
    const laserUnits = new Set((run?.statements ?? []).map((s) => s.unitRef.toUpperCase()));
    const tenants = (run?.statements ?? []).map((s) => {
      const hit = agingLookup(aging, s.unitRef, s.tenantName);
      const fresh = hit.kind === "found" && hit.tenant.asOf >= laserDate(s, run?.updatedAt);
      const a = accountOf(fresh && hit.kind === "found" ? statementFromAging(hit.tenant, s) : s);
      return { unitRef: s.unitRef, tenantName: s.tenantName, propertyCode: s.propertyCode, propertyName: propertyName(s.propertyCode), gross: a.gross, credit: a.credit, net: a.net, source: fresh ? "aging" : "statement" };
    });
    // On the aging report and not on that month's laser statement (a newer
    // tenant, or one the laser run left off).
    for (const t of aging.tenants) {
      if (laserUnits.has(t.unitRef.toUpperCase()) || /-FO$/i.test(t.unitRef)) continue;
      const a = accountOf(statementFromAging(t, null));
      tenants.push({ unitRef: t.unitRef, tenantName: t.tenantName, propertyCode: t.propertyCode, propertyName: propertyName(t.propertyCode), gross: a.gross, credit: a.credit, net: a.net, source: "aging" });
    }
    const agingAsOf = Object.values(aging.coverage).sort().pop() ?? null;
    const now = new Date();
    return NextResponse.json({
      ok: true, period, periods: runs.map((r) => r.period).sort().reverse(), tenants,
      // The day the month's data was posted — the last day its figures are accurate.
      dates: {
        dataThrough: (run?.statements ?? []).map((s) => s.exportedAt ?? "").sort().pop() || null,
        importedOn: (run?.statements ?? []).map((s) => s.importedAt ?? "").sort().pop() || run?.updatedAt || null,
        stampRead: (run?.statements ?? []).some((s) => s.exportedAt !== undefined),
      },
      aging: agingAsOf ? { asOf: agingAsOf, runAt: aging.tenants.find((t) => t.asOf === agingAsOf)?.runAt ?? null, properties: Object.keys(aging.coverage).length } : null,
      receipts: receipts.map((r) => ({ ...r, status: receiptStatus(r, now) })),
      sentEmails,
    });
  }

  const found = await statementOf(period, unit);
  if (!found) return NextResponse.json({ error: "No statement for that tenant and month." }, { status: 404 });
  const { st, asOf, dates } = found;
  // ?pdf=1 — the statement exactly as it will be attached, to preview.
  if (q.get("pdf")) {
    const a = await statementPdf(period, st);
    return new NextResponse(Buffer.from(a.content), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${a.name}"`, "Cache-Control": "no-store" } });
  }
  const acct = accountOf(st);
  const amount = money(q.get("amount"));
  const explanations = Number.isFinite(amount) && amount > 0 ? explainPayment(acct, amount, { currentMonth: period }) : [];
  const recipients = await recipientsFor(st.unitRef);
  const planId = q.get("plan");
  // The editable opening / closing, and the generated table between them.
  let draft: { subject: string; opening: string; closing: string; tableHtml: string; signature: EmailSignature } | null = null;
  const plan = planId && Number.isFinite(amount) ? planById(acct, amount, planId, { currentMonth: period }) : explanations[0] ?? null;
  if (plan && Number.isFinite(amount)) {
    const received = isISO(q.get("received")) ? q.get("received")! : todayET();
    const parts = receiptEmailParts({
      tenantName: st.tenantName, propertyName: propertyName(st.propertyCode), suite: st.suite, amount, receivedISO: received,
      checkNo: q.get("check") || null, asOfISO: asOf, acct, plan, attached: q.get("attach") !== "0", respondByISO: respondByFrom(todayET()), signer: await signer(st.propertyCode),
    });
    draft = { ...parts, tableHtml: receiptTableHtml({ acct, plan, asOfISO: asOf }), signature: (await signer(st.propertyCode)).signature };
  }
  // The Credit Balance report covering this tenant's property — when it is
  // newer than the laser statement, it is the most recent data on the page.
  const ag = await currentAging();
  const agAsOf = ag.coverage[st.propertyCode] ?? null;
  const agingRun = agAsOf ? { asOf: agAsOf, runAt: ag.tenants.find((t) => t.propertyCode === st.propertyCode && t.asOf === agAsOf)?.runAt ?? null } : null;
  return NextResponse.json({
    ok: true, period, asOf, dates, aging: agingRun, source: found.dates.source, agingAsOf: found.agingAsOf,
    tenant: { unitRef: st.unitRef, tenantName: st.tenantName, propertyCode: st.propertyCode, propertyName: propertyName(st.propertyCode), suite: st.suite, tiesOut: st.tiesOut },
    account: acct, explanations, plan, recipients, draft, respondBy: respondByFrom(todayET()),
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const action = String(b?.action ?? "");
  const by = await who();

  if (action === "send" || action === "draft") {
    const period = String(b?.period ?? ""), unit = String(b?.unitRef ?? "");
    const amount = money(b?.amount);
    if (!period || !unit || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Tenant, month and a payment amount are required." }, { status: 400 });
    const found = await statementOf(period, unit);
    if (!found) return NextResponse.json({ error: "No statement for that tenant and month." }, { status: 404 });
    const { st } = found;
    const acct = accountOf(st);
    const plan: Explanation | null = planById(acct, amount, String(b?.plan ?? ""), { currentMonth: period });
    if (!plan) return NextResponse.json({ error: "That application no longer fits the statement — re-open the tenant." }, { status: 409 });
    const receivedISO = isISO(b?.receivedISO) ? b.receivedISO : todayET();
    const checkNo = typeof b?.checkNo === "string" && b.checkNo.trim() ? b.checkNo.trim().slice(0, 30) : null;
    const now = new Date().toISOString();
    const rec: ReceiptRec = {
      id: typeof b?.id === "string" && b.id ? b.id : `${todayET()}-${st.unitRef}-${Math.random().toString(36).slice(2, 7)}`,
      period, unitRef: st.unitRef, tenantName: st.tenantName, propertyCode: st.propertyCode,
      ...(found.agingAsOf ? { agingAsOf: found.agingAsOf } : {}),
      amount, receivedISO, checkNo, plan, email: null, respondByISO: null, reply: null, confirmedAt: null, postedAt: null, postedBy: null,
      createdAt: now, createdBy: by,
    };

    if (action === "send") {
      if (!isMailConfigured()) return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
      const recipients = await recipientsFor(st.unitRef);
      const pickedOut = new Set(Array.isArray(b?.exclude) ? b.exclude.map((x: unknown) => String(x).toLowerCase()) : []);
      const to = recipients.filter((e) => !pickedOut.has(e.toLowerCase()));
      if (!to.length) return NextResponse.json({ error: "No email on file for this suite — add a contact on the unit page first." }, { status: 400 });
      const subject = typeof b?.subject === "string" && b.subject.trim() ? b.subject.trim().slice(0, 200) : "";
      const opening = typeof b?.opening === "string" ? b.opening.slice(0, 10000) : "";
      const closing = typeof b?.closing === "string" ? b.closing.slice(0, 10000) : "";
      if (!subject || !opening.trim()) return NextResponse.json({ error: "The email has no subject or opening." }, { status: 400 });
      // The table is re-rendered HERE from the plan just re-derived — the
      // figures the tenant reads are never the client's.
      const sig = await signer(st.propertyCode);
      const { html, text: body } = renderReceiptEmail({ acct, plan, asOfISO: found.asOf }, opening, closing, sig.signature);
      const attach = b?.attachStatement !== false;
      const msg = {
        to: to.join(", "), bcc: sig.email, subject, textBody: body, htmlBody: html, headers: [{ Name: "Reply-To", Value: sig.email }],
        ...(attach ? { attachments: [await statementPdf(period, st)] } : {}),
      };
      // From Tami's own address. Postmark sends only from an address it has
      // verified, so if hers is refused the email still goes — from the
      // portal's verified sender, under her name, replies still to her.
      const { result: sent, fromHeader, fromUsed } = await sendFromAr(msg, sig);
      if (!sent.ok) return NextResponse.json({ error: `The email did not send: ${sent.error ?? "unknown error"}` }, { status: 502 });
      rec.respondByISO = respondByFrom(todayET());
      // The archive: the email EXACTLY as it went — kept on its own, so the
      // proof that we asked survives the receipt record.
      const att = msg.attachments?.[0] ?? null;
      const archived: SentReceiptEmail = {
        id: `${now.replace(/\D/g, "").slice(0, 14)}-${st.unitRef}-${Math.random().toString(36).slice(2, 7)}`,
        receiptId: rec.id, period, unitRef: st.unitRef, tenantName: st.tenantName, propertyCode: st.propertyCode,
        amount, planTitle: plan.title, respondByISO: rec.respondByISO,
        sentAt: now, sentBy: by, from: fromHeader, to, bcc: sig.email, replyTo: sig.email, subject, html, text: body,
        messageId: sent.messageId ?? null, testMode: !!sent.testMode,
        attachment: att ? { name: att.name, contentType: att.contentType, size: att.content.byteLength, base64: Buffer.from(att.content).toString("base64") } : null,
      };
      try { await recordSentEmail(archived); }
      catch (err) { console.error(`[receipts] the email to ${st.unitRef} went but could not be archived`, err); }
      const prior = typeof b?.id === "string" && b.id ? await getReceipt(b.id) : null;
      rec.emailIds = [...(prior?.emailIds ?? []), archived.id];
      rec.email = { to, subject, body, sentAt: now, sentBy: by, from: fromUsed, attachedStatement: attach, messageId: archived.messageId, archiveId: archived.id };
    }
    await saveReceipt(rec);
    await logAudit({ event: `tenant-statements.receipt-${action}`, user: by, ip: auditIp(req), detail: `${st.unitRef} · $${amount.toFixed(2)} · ${plan.title}` });
    return NextResponse.json({ ok: true, receipt: { ...rec, status: receiptStatus(rec) } });
  }

  const id = String(b?.id ?? "");
  const rec = id ? await getReceipt(id) : null;
  if (!rec) return NextResponse.json({ error: "That receipt is not on file." }, { status: 404 });

  if (action === "confirm") {
    // The tenant answered: re-derive the plan they asked for (or keep ours).
    if (b?.plan) {
      const found = await statementForReceipt(rec);
      if (!found) return NextResponse.json({ error: "The statement for that month is gone." }, { status: 404 });
      const plan = planById(accountOf(found.st), rec.amount, String(b.plan), { currentMonth: rec.period });
      if (!plan) return NextResponse.json({ error: "That application does not fit the statement." }, { status: 409 });
      rec.plan = plan;
    }
    rec.reply = { at: new Date().toISOString(), by, note: typeof b?.note === "string" ? b.note.slice(0, 2000) : "" };
    rec.confirmedAt = new Date().toISOString();
  } else if (action === "posted") {
    rec.postedAt = new Date().toISOString(); rec.postedBy = by;
  } else if (action === "unposted") {
    rec.postedAt = null; rec.postedBy = null;
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  await saveReceipt(rec);
  await logAudit({ event: `tenant-statements.receipt-${action}`, user: by, ip: auditIp(req), detail: `${rec.unitRef} · $${rec.amount.toFixed(2)}` });
  return NextResponse.json({ ok: true, receipt: { ...rec, status: receiptStatus(rec) } });
}

export async function DELETE(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const id = String(b?.id ?? "");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await deleteReceipt(id);
  return NextResponse.json({ ok: true });
}
