// Tenant correspondence — every email we have sent a suite, and the balance
// reminder. Behind /tenant-statements by the middleware, inside Tami's write
// scope.
//
//   GET                                   → the last contact per suite (the roster's column)
//   GET ?unit=                            → that suite's every email, newest first
//   GET ?source=&id=[&format=eml|pdf]     → one email as sent (JSON), as .eml, or its attachment
//   GET ?draft=1&period=&unit=            → the balance reminder, drafted, with its recipients
//   POST { action: "reminder", … }        → send it (the table is re-rendered from the stored
//                                           statement), Bcc Tami, record it

import { NextRequest, NextResponse } from "next/server";
import { statementOf } from "@/lib/statements/currentAccount";
import { accountOf } from "@/lib/statements/receiptMatch";
import { summarize } from "@/lib/statements/summary";
import { reminderEmailParts, reminderTableHtml, renderReminderEmail } from "@/lib/statements/balanceReminder";
import { lastContactByUnit } from "@/lib/statements/correspondence";
import { allCorrespondence, correspondenceForUnit, fullEmail, newCorrespondenceId, recordTenantEmail } from "@/lib/statements/correspondenceStore";
import { arSigner, propertyLabel, sendFromAr, statementPdf, suiteRecipients } from "@/lib/statements/tenantMail";
import { toEml } from "@/lib/statements/receiptEml";
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
const safeName = (s: string) => s.replace(/[^\w]+/g, "_");
const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = q.get("id");
  if (id) {
    const e = await fullEmail(q.get("source") ?? "log", id);
    if (!e) return NextResponse.json({ error: "That email is not on file." }, { status: 404 });
    if (q.get("format") === "eml") {
      if (!e.html && !e.text) return NextResponse.json({ error: "The wording of that email was not kept." }, { status: 404 });
      const eml = toEml({
        sentAt: e.sentAt, from: e.from ?? "Korman Commercial Properties", to: e.to, bcc: e.bcc, replyTo: e.replyTo, subject: e.subject,
        html: e.html ?? `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${escHtml(e.text ?? "")}</pre>`, text: e.text ?? "",
        messageId: e.messageId, attachment: e.attachment,
      });
      return new NextResponse(eml, { headers: {
        "Content-Type": "message/rfc822", "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${safeName(e.tenantName)}_${e.sentAt.slice(0, 10)}_email.eml"`,
      } });
    }
    if (q.get("format") === "pdf") {
      if (!e.attachment) return NextResponse.json({ error: "Nothing was attached to that email." }, { status: 404 });
      return new NextResponse(Buffer.from(e.attachment.base64, "base64"), { headers: {
        "Content-Type": e.attachment.contentType, "Cache-Control": "no-store", "Content-Disposition": `inline; filename="${e.attachment.name}"`,
      } });
    }
    const { attachment, ...rest } = e;
    return NextResponse.json({ ok: true, email: { ...rest, attachmentName: attachment?.name ?? null } });
  }

  if (q.get("draft")) {
    const period = q.get("period") ?? "", unit = q.get("unit") ?? "";
    const found = await statementOf(period, unit);
    if (!found) return NextResponse.json({ error: "No statement for that tenant and month." }, { status: 404 });
    const { st, asOf } = found;
    const acct = accountOf(st);
    const parts = reminderEmailParts({
      tenantName: st.tenantName, propertyName: propertyLabel(st.propertyCode), suite: st.suite, acct,
      pastDue: summarize(st, period).pastDueAmount, asOfISO: asOf, attached: q.get("attach") !== "0", signer: await arSigner(st.propertyCode),
    });
    return NextResponse.json({ ok: true, draft: { ...parts, tableHtml: reminderTableHtml(acct, asOf) }, recipients: await suiteRecipients(st.unitRef), balance: acct.net });
  }

  const unit = q.get("unit");
  if (unit) return NextResponse.json({ ok: true, entries: await correspondenceForUnit(unit) });
  return NextResponse.json({ ok: true, last: lastContactByUnit(await allCorrespondence()) });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  if (b?.action !== "reminder") return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (!isMailConfigured()) return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
  const period = String(b?.period ?? ""), unit = String(b?.unitRef ?? "");
  const found = await statementOf(period, unit);
  if (!found) return NextResponse.json({ error: "No statement for that tenant and month." }, { status: 404 });
  const { st, asOf } = found;
  const acct = accountOf(st);
  const pickedOut = new Set(Array.isArray(b?.exclude) ? b.exclude.map((x: unknown) => String(x).toLowerCase()) : []);
  const to = (await suiteRecipients(st.unitRef)).filter((e) => !pickedOut.has(e.toLowerCase()));
  if (!to.length) return NextResponse.json({ error: "No email on file for this suite — add a contact on the unit page first." }, { status: 400 });
  const subject = typeof b?.subject === "string" ? b.subject.trim().slice(0, 200) : "";
  const opening = typeof b?.opening === "string" ? b.opening.slice(0, 10000) : "";
  const closing = typeof b?.closing === "string" ? b.closing.slice(0, 10000) : "";
  if (!subject || !opening.trim()) return NextResponse.json({ error: "The email has no subject or opening." }, { status: 400 });

  // The table is re-rendered HERE from the stored statement.
  const { html, text } = renderReminderEmail(acct, asOf, opening, closing);
  const sig = await arSigner(st.propertyCode);
  const att = b?.attachStatement !== false ? await statementPdf(period, st) : null;
  const { result, fromHeader } = await sendFromAr({
    to: to.join(", "), bcc: sig.email, subject, textBody: text, htmlBody: html,
    headers: [{ Name: "Reply-To", Value: sig.email }], ...(att ? { attachments: [att] } : {}),
  }, sig);
  if (!result.ok) return NextResponse.json({ error: `The email did not send: ${result.error ?? "unknown error"}` }, { status: 502 });

  const by = await who();
  await recordTenantEmail({
    id: newCorrespondenceId(st.unitRef), kind: "balance-reminder", unitRef: st.unitRef, propertyCode: st.propertyCode, tenantName: st.tenantName,
    sentAt: new Date().toISOString(), sentBy: by, from: fromHeader, to, bcc: sig.email, replyTo: sig.email, subject, text, html,
    messageId: result.messageId ?? null, testMode: !!result.testMode,
    attachment: att ? { name: att.name, contentType: att.contentType, size: att.content.byteLength, base64: Buffer.from(att.content).toString("base64") } : null,
    summary: `${money2(acct.net)} open`, refId: null, balance: acct.net,
  });
  await logAudit({ event: "tenant-statements.balance-reminder", user: by, ip: auditIp(req), detail: `${st.unitRef} · ${to.length} recipient(s)` });
  return NextResponse.json({ ok: true, to });
}
