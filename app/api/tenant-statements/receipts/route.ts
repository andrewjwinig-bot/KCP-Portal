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
import { allRuns, getRun } from "@/lib/statements/store";
import { accountOf, composeReceiptEmail, explainPayment, planById, respondByFrom, type Explanation } from "@/lib/statements/receiptMatch";
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

async function statementOf(period: string, unit: string): Promise<{ st: TenantStatement; asOf: string | null } | null> {
  const run = await getRun(period);
  const st = run?.statements.find((s) => s.unitRef.toUpperCase() === unit.toUpperCase()) ?? null;
  return st ? { st, asOf: st.importedAt?.slice(0, 10) ?? run?.updatedAt?.slice(0, 10) ?? null } : null;
}

async function recipientsFor(unitRef: string): Promise<string[]> {
  const rec = await getOrEmptySuiteContacts(unitRef.replace(/-FO$/i, ""));
  return camRecipientEmails(rec.contacts).split(";").map((s) => s.trim()).filter(Boolean);
}

async function signer(propertyCode: string) {
  const ins = await instructionsFor(propertyCode);
  const email = (process.env.RECEIPT_REPLY_TO ?? "").trim() || ins.contactEmail;
  return { name: "Accounts Receivable", email, phone: ins.contactPhone || undefined };
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
      receipts: receipts.map((r) => ({ ...r, status: receiptStatus(r, now) })),
    });
  }

  const found = await statementOf(period, unit);
  if (!found) return NextResponse.json({ error: "No statement for that tenant and month." }, { status: 404 });
  const { st, asOf } = found;
  const acct = accountOf(st);
  const amount = money(q.get("amount"));
  const explanations = Number.isFinite(amount) && amount > 0 ? explainPayment(acct, amount, { currentMonth: period }) : [];
  const recipients = await recipientsFor(st.unitRef);
  const planId = q.get("plan");
  let draft: { subject: string; body: string } | null = null;
  const plan = planId && Number.isFinite(amount) ? planById(acct, amount, planId, { currentMonth: period }) : explanations[0] ?? null;
  if (plan && Number.isFinite(amount)) {
    const received = isISO(q.get("received")) ? q.get("received")! : todayET();
    draft = composeReceiptEmail({
      tenantName: st.tenantName, propertyName: propertyName(st.propertyCode), suite: st.suite, amount, receivedISO: received,
      checkNo: q.get("check") || null, asOfISO: asOf, acct, plan, respondByISO: respondByFrom(todayET()), signer: await signer(st.propertyCode),
    });
  }
  return NextResponse.json({
    ok: true, period, asOf,
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
      const body = typeof b?.body === "string" && b.body.trim() ? b.body.slice(0, 20000) : "";
      if (!subject || !body) return NextResponse.json({ error: "The email has no subject or body." }, { status: 400 });
      const sig = await signer(st.propertyCode);
      const sent = await sendMailDetailed({
        from: `Korman Commercial Properties <${VERIFIED_FROM}>`, to: to.join(", "), bcc: sig.email, subject, textBody: body,
        headers: [{ Name: "Reply-To", Value: sig.email }],
      });
      if (!sent.ok) return NextResponse.json({ error: `The email did not send: ${sent.error ?? "unknown error"}` }, { status: 502 });
      rec.email = { to, subject, body, sentAt: now, sentBy: by };
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
