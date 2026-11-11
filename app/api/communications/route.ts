// Tenant Communications — the Interplex tenant emails (Greg's page).
// Behind /communications by the middleware (SENSITIVE_API_PREFIXES).
//
//   GET                         → templates, recipients, send history, what's due
//   GET ?due=1                  → only what's due (the dashboard prompt)
//   GET ?id=<send id>           → one send, suite by suite
//   POST { action: "test", templateId, subject, to }      → one copy to a staff address
//   POST { action: "send", templateId, subject, excluded } → one email per suite, recorded

import { NextRequest, NextResponse } from "next/server";
import { TENANT_TEMPLATES, dueTemplates, renderTenantEmail, templateById } from "@/lib/communications/templates";
import { allSends, getSend, interplexRecipients, recordSend, type SendLine } from "@/lib/communications/store";
import { isMailConfigured, isMailTestMode } from "@/lib/mail";
import { sendFromAr } from "@/lib/statements/tenantMail";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// One email per suite — a whole park can take a while.
export const maxDuration = 300;

// Greg sends these and answers them. TENANT_COMMS_FROM / _NAME override without a deploy.
const FROM = (process.env.TENANT_COMMS_FROM ?? "gmasciantonio@kormancommercial.com").trim();
const FROM_NAME = (process.env.TENANT_COMMS_FROM_NAME ?? "Property Management").trim();

const todayET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

async function lastSentById(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const s of await allSends()) {
    if (s.testMode || !s.lines.some((l) => l.ok)) continue;
    if (!out[s.templateId] || s.sentAt > out[s.templateId]) out[s.templateId] = s.sentAt;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = q.get("id");
  if (id) {
    const s = await getSend(id);
    return s ? NextResponse.json({ ok: true, send: s }) : NextResponse.json({ error: "That send is not on file." }, { status: 404 });
  }
  const last = await lastSentById();
  const due = dueTemplates(todayET(), last).map((d) => ({ id: d.template.id, name: d.template.name, dueISO: d.dueISO, overdue: d.overdue }));
  if (q.get("due")) return NextResponse.json({ ok: true, due });

  const [recipients, sends] = await Promise.all([interplexRecipients(), allSends()]);
  return NextResponse.json({
    ok: true,
    templates: TENANT_TEMPLATES,
    recipients,
    lastSent: last,
    due,
    from: `${FROM_NAME}, Korman Commercial Properties <${FROM}>`,
    mailReady: isMailConfigured(),
    testMode: isMailTestMode(),
    sends: sends.map((s) => ({
      id: s.id, templateId: s.templateId, subject: s.subject, sentAt: s.sentAt, sentBy: s.sentBy, testMode: s.testMode,
      suites: s.lines.length, delivered: s.lines.filter((l) => l.ok).length,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const t = templateById(String(body?.templateId ?? ""));
  if (!t) return NextResponse.json({ error: "Pick an email to send." }, { status: 400 });
  const subject = String(body?.subject ?? "").trim().slice(0, 200) || t.subject;
  if (!isMailConfigured()) return NextResponse.json({ error: "Email is not set up on this server." }, { status: 503 });
  const user = await budgetUser();
  const by = user ? USERS[user]?.label ?? user : null;
  const { html, text } = renderTenantEmail(t);
  const sig = { name: FROM_NAME, email: FROM };

  if (body?.action === "test") {
    const to = String(body?.to ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return NextResponse.json({ error: "Enter an email address for the test." }, { status: 400 });
    const { result } = await sendFromAr({ to, subject: `[Test] ${subject}`, htmlBody: html, textBody: text }, sig);
    if (!result.ok) return NextResponse.json({ error: result.error ?? "The test did not send." }, { status: 502 });
    return NextResponse.json({ ok: true, testMode: !!result.testMode });
  }

  if (body?.action !== "send") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const excluded = new Set<string>((Array.isArray(body?.excluded) ? body.excluded : []).map((u: unknown) => String(u).toUpperCase()));
  // The server decides who gets it: the roll's occupied suites and their
  // contacts on file, minus any the sender unticked. Never a client list.
  const recipients = (await interplexRecipients()).filter((r) => r.emails.length && !excluded.has(r.unitRef.toUpperCase()));
  if (!recipients.length) return NextResponse.json({ error: "No tenants with an email on file are selected." }, { status: 400 });

  // A tenant on several suites, or a contact on several tenants, gets it once.
  const sentTo = new Set<string>();
  const jobs = recipients.map((r) => {
    const to = r.emails.filter((e) => !sentTo.has(e.toLowerCase()));
    to.forEach((e) => sentTo.add(e.toLowerCase()));
    return { r, to };
  }).filter((j) => j.to.length);

  const lines: SendLine[] = [];
  let fromUsed = FROM;
  for (let i = 0; i < jobs.length; i += 5) {
    const batch = await Promise.all(jobs.slice(i, i + 5).map(async ({ r, to }) => {
      const { result, fromUsed: f } = await sendFromAr({ to: to.join(", "), subject, htmlBody: html, textBody: text }, sig);
      fromUsed = f;
      return { unitRef: r.unitRef, tenant: r.tenant, to, ok: result.ok, messageId: result.messageId, error: result.ok ? undefined : result.error ?? "Not sent" } satisfies SendLine;
    }));
    lines.push(...batch);
  }

  const id = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${t.id}-${Math.random().toString(36).slice(2, 6)}`;
  const record = { id, templateId: t.id, subject, sentAt: new Date().toISOString(), sentBy: by, from: fromUsed, lines, testMode: isMailTestMode() };
  await recordSend(record);
  const delivered = lines.filter((l) => l.ok).length;
  await logAudit({ event: "communications.send", user: by, ip: auditIp(req), detail: `${t.id} · "${subject}" · ${delivered}/${lines.length} suites` });
  return NextResponse.json({ ok: true, id, delivered, failed: lines.length - delivered, testMode: record.testMode, failures: lines.filter((l) => !l.ok) });
}
