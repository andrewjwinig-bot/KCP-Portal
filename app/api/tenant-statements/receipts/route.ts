// Receipt Reconciliation API — behind /tenant-statements by the middleware
// (`/api/tenant-statements` → the Monthly Statements page), and inside Tami's
// write scope.
//
//   GET  ?period=                → the month's tenants (for the picker) and every receipt record
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
import { jsPDF } from "jspdf";
import { drawMonthlyStatement } from "@/lib/statements/monthlyStatementPdf";
import { allRuns, getRun } from "@/lib/statements/store";
import { accountOf, explainPayment, planById, receiptEmailParts, receiptTableHtml, renderReceiptEmail, respondByFrom, type Explanation } from "@/lib/statements/receiptMatch";
import { allReceipts, deleteReceipt, getReceipt, receiptStatus, saveReceipt, todayET, type ReceiptRec } from "@/lib/statements/receiptStore";
import { instructionsFor } from "@/lib/statements/payment";
import { getOrEmptySuiteContacts } from "@/lib/suites/contactsStorage";
import { camRecipientEmails } from "@/lib/suites/contacts";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { sendMailDetailed, VERIFIED_FROM, isMailConfigured } from "@/lib/mail";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";
import { logAudit, auditIp } from "@/lib/audit";
import type { TenantStatement } from "@/lib/statements/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const propertyName = (code: string) => {
  const d = PROPERTY_DEFS.find((p) => p.id === code);
  if (!d) return code;
  return d.fundGroup ? `${d.name}, Neshaminy Interplex` : d.name;
};
const money = (n: unknown) => { const v = Math.round(Number(n) * 100) / 100; return Number.isFinite(v) ? v : NaN; };
const isISO = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function latestPeriod(): Promise<string | null> {
  const runs = await allRuns();
  return runs.map((r) => r.period).sort().pop() ?? null;
}

/** When the figures are true as of: Skyline's export time (the workbook's own
 *  stamp, `exportedAt`) — NOT the day it was imported into the portal, which
 *  can be days later. Imports before the stamp was read have only the import. */
type DataDates = { dataThrough: string | null; importedOn: string | null; stampRead: boolean };

async function statementOf(period: string, unit: string): Promise<{ st: TenantStatement; asOf: string | null; dates: DataDates } | null> {
  const run = await getRun(period);
  const st = run?.statements.find((s) => s.unitRef.toUpperCase() === unit.toUpperCase()) ?? null;
  if (!st) return null;
  // `exportedAt` undefined = imported before the stamp was read; null = the
  // file itself records no creation time.
  const dates: DataDates = { dataThrough: st.exportedAt ?? null, importedOn: st.importedAt ?? run?.updatedAt ?? null, stampRead: st.exportedAt !== undefined };
  return { st, dates, asOf: (dates.dataThrough ?? dates.importedOn)?.slice(0, 10) ?? null };
}

/** The tenant's statement of account for the month — the same branded PDF
 *  their portal serves — attached to the receipt email (owner: "attach the
 *  tenant's most recent laser statement"). */
async function statementPdf(period: string, st: TenantStatement): Promise<{ name: string; content: Uint8Array; contentType: string }> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  // The statement attached to Tami's email names HER as the contact, even if
  // a stored Payment Instructions override still carries an older name.
  const payment = { ...(await instructionsFor(st.propertyCode)), contactName: RECEIPT_FROM_NAME, contactEmail: RECEIPT_FROM };
  drawMonthlyStatement(doc, st, { propLabel: `${st.propertyCode} — ${propertyName(st.propertyCode)}`, period, payment });
  const safe = (s: string) => s.replace(/[^\w]+/g, "_");
  return { name: `${safe(st.tenantName)}_${period}_Statement.pdf`, content: new Uint8Array(doc.output("arraybuffer")), contentType: "application/pdf" };
}

async function recipientsFor(unitRef: string): Promise<string[]> {
  const rec = await getOrEmptySuiteContacts(unitRef.replace(/-FO$/i, ""));
  return camRecipientEmails(rec.contacts).split(";").map((s) => s.trim()).filter(Boolean);
}

// Tami sends these and answers them (owner, 11/2026: "set it up to be from
// ttomlinson@kormancommercial.com"): her address is the From, the Reply-To
// and the blind copy, and she signs it. RECEIPT_FROM / RECEIPT_FROM_NAME
// override without a deploy.
const RECEIPT_FROM = (process.env.RECEIPT_FROM ?? "ttomlinson@kormancommercial.com").trim();
const RECEIPT_FROM_NAME = (process.env.RECEIPT_FROM_NAME ?? "Tami Tomlinson").trim();

async function signer(propertyCode: string) {
  const ins = await instructionsFor(propertyCode);
  return { name: RECEIPT_FROM_NAME, title: "Accounts Receivable", email: RECEIPT_FROM, phone: ins.contactPhone || undefined };
}

async function who(): Promise<string | null> {
  const u = await budgetUser();
  return u ? USERS[u]?.label ?? u : null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const period = q.get("period") || (await latestPeriod());
  if (!period) return NextResponse.json({ ok: true, period: null, periods: [], tenants: [], receipts: [] });
  const unit = q.get("unit");

  if (!unit) {
    const [run, runs, receipts] = await Promise.all([getRun(period), allRuns(), allReceipts()]);
    const tenants = (run?.statements ?? []).map((s) => {
      const a = accountOf(s);
      return { unitRef: s.unitRef, tenantName: s.tenantName, propertyCode: s.propertyCode, propertyName: propertyName(s.propertyCode), gross: a.gross, credit: a.credit, net: a.net };
    });
    const now = new Date();
    return NextResponse.json({
      ok: true, period, periods: runs.map((r) => r.period).sort().reverse(), tenants,
      // The day the month's data was posted — the last day its figures are accurate.
      dates: {
        dataThrough: (run?.statements ?? []).map((s) => s.exportedAt ?? "").sort().pop() || null,
        importedOn: (run?.statements ?? []).map((s) => s.importedAt ?? "").sort().pop() || run?.updatedAt || null,
        stampRead: (run?.statements ?? []).some((s) => s.exportedAt !== undefined),
      },
      receipts: receipts.map((r) => ({ ...r, status: receiptStatus(r, now) })),
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
  let draft: { subject: string; opening: string; closing: string; tableHtml: string } | null = null;
  const plan = planId && Number.isFinite(amount) ? planById(acct, amount, planId, { currentMonth: period }) : explanations[0] ?? null;
  if (plan && Number.isFinite(amount)) {
    const received = isISO(q.get("received")) ? q.get("received")! : todayET();
    const parts = receiptEmailParts({
      tenantName: st.tenantName, propertyName: propertyName(st.propertyCode), suite: st.suite, amount, receivedISO: received,
      checkNo: q.get("check") || null, asOfISO: asOf, acct, plan, attached: q.get("attach") !== "0", respondByISO: respondByFrom(todayET()), signer: await signer(st.propertyCode),
    });
    draft = { ...parts, tableHtml: receiptTableHtml({ acct, plan, asOfISO: asOf }) };
  }
  return NextResponse.json({
    ok: true, period, asOf, dates,
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
      const { html, text: body } = renderReceiptEmail({ acct, plan, asOfISO: found.asOf }, opening, closing);
      const sig = await signer(st.propertyCode);
      const attach = b?.attachStatement !== false;
      const msg = {
        to: to.join(", "), bcc: sig.email, subject, textBody: body, htmlBody: html, headers: [{ Name: "Reply-To", Value: sig.email }],
        ...(attach ? { attachments: [await statementPdf(period, st)] } : {}),
      };
      // From Tami's own address. Postmark sends only from an address it has
      // verified, so if hers is refused the email still goes — from the
      // portal's verified sender, under her name, replies still to her.
      let fromUsed = sig.email;
      let sent = await sendMailDetailed({ ...msg, from: `${sig.name}, Korman Commercial Properties <${sig.email}>` });
      if (!sent.ok && sig.email.toLowerCase() !== VERIFIED_FROM.toLowerCase()) {
        console.warn(`[receipts] sending from ${sig.email} refused (${sent.error}) — retrying from ${VERIFIED_FROM}`);
        fromUsed = VERIFIED_FROM;
        sent = await sendMailDetailed({ ...msg, from: `${sig.name}, Korman Commercial Properties <${VERIFIED_FROM}>` });
      }
      if (!sent.ok) return NextResponse.json({ error: `The email did not send: ${sent.error ?? "unknown error"}` }, { status: 502 });
      rec.email = { to, subject, body, sentAt: now, sentBy: by, from: fromUsed, attachedStatement: attach };
      rec.respondByISO = respondByFrom(todayET());
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
      const found = await statementOf(rec.period, rec.unitRef);
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
