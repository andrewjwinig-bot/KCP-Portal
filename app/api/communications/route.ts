// Tenant Communications — the Interplex tenant emails (Greg's page).
// Behind /communications by the middleware (SENSITIVE_API_PREFIXES).
//
// The portal does NOT send these (owner, 11/2026: "dont let greg send the
// emails from the portal but make it a draft email in his outlook to add his
// custom distribution lists"). The page builds an Outlook draft
// (`draftEml.ts`); Greg sends it from Outlook, then marks it sent here so the
// seasonal prompt clears and the history keeps it.
//
//   GET                       → templates, send history, what's due
//   GET ?due=1                → only what's due (the dashboard prompt)
//   GET ?id=<send id>         → one send
//   POST { action: "sent", templateId, subject } → record that it went out from Outlook

import { NextRequest, NextResponse } from "next/server";
import { TENANT_TEMPLATES, dueTemplates, templateById } from "@/lib/communications/templates";
import { allSends, getSend, recordSend } from "@/lib/communications/store";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const todayET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

async function lastSentById(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const s of await allSends()) {
    if (s.testMode || !(s.viaOutlook || s.lines.some((l) => l.ok))) continue;
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

  const sends = await allSends();
  return NextResponse.json({
    ok: true,
    templates: TENANT_TEMPLATES,
    lastSent: last,
    due,
    sends: sends.map((s) => ({
      id: s.id, templateId: s.templateId, subject: s.subject, sentAt: s.sentAt, sentBy: s.sentBy, testMode: s.testMode,
      viaOutlook: !!s.viaOutlook, suites: s.lines.length, delivered: s.lines.filter((l) => l.ok).length,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.action !== "sent") return NextResponse.json({ error: "The portal does not send tenant emails — send the draft from Outlook." }, { status: 400 });
  const t = templateById(String(body?.templateId ?? ""));
  if (!t) return NextResponse.json({ error: "Pick an email." }, { status: 400 });
  const subject = String(body?.subject ?? "").trim().slice(0, 200) || t.subject;
  const user = await budgetUser();
  const by = user ? USERS[user]?.label ?? user : null;
  const id = `${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${t.id}-${Math.random().toString(36).slice(2, 6)}`;
  await recordSend({ id, templateId: t.id, subject, sentAt: new Date().toISOString(), sentBy: by, from: "Outlook", lines: [], testMode: false, viaOutlook: true });
  await logAudit({ event: "communications.sent-from-outlook", user: by, ip: auditIp(req), detail: `${t.id} · "${subject}"` });
  return NextResponse.json({ ok: true, id });
}
