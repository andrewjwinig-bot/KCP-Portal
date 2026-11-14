// The monthly tenant notices — Greg's review page (/tenant-statements/notices).
// Answers to that page or Monthly Statements (lib/users.ts); deliberately NOT
// under /api/tenant-statements, whose writes need the full Monthly Statements
// grant — Greg approves and sends here without it.
//
//   GET [?month=]                → the batch, its counts, the month's credit requests
//   GET ?month=&preview=<unit>   → that tenant's notice as it would send (HTML)
//   POST { action: "build" }                     → build / rebuild this month's batch now
//   POST { action: "toggle", month, unitRefs, send }  → tick / untick
//   POST { action: "send", month }               → send every ticked notice
//   POST { action: "posted", month, unitRef, posted } → Tami marks a credit posted
//   POST { action: "summary" }                   → send the credit summary now

import { NextRequest, NextResponse } from "next/server";
import { batchCounts, willSend } from "@/lib/statements/reminderBatch";
import {
  buildBatch, creditRequestsFor, getBatch, listBatches, markPosted, previewNotice, sendBatch, sendCreditSummary, setSend,
} from "@/lib/statements/reminderBatchStore";
import { creditSummaryDay, etToday, applyDeadline } from "@/lib/statements/reminderSchedule";
import { isMailConfigured } from "@/lib/mail";
import { linkOrigin } from "@/lib/linkOrigin";
import { budgetUser } from "@/lib/financials/budgets/currentUser";
import { USERS } from "@/lib/users";
import { logAudit, auditIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

async function who(): Promise<string | null> {
  const u = await budgetUser();
  return u ? USERS[u]?.label ?? u : null;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const month = q.get("month") || etToday().slice(0, 7);
  const batch = await getBatch(month);
  const preview = q.get("preview");
  if (preview) {
    const item = batch?.items.find((i) => i.unitRef.toUpperCase() === preview.toUpperCase());
    if (!batch || !item) return NextResponse.json({ error: "That tenant is not in this month's notices." }, { status: 404 });
    const p = await previewNotice(batch, item);
    return NextResponse.json({ ok: true, subject: p.subject, html: p.html, to: item.recipients });
  }
  const [requests, all] = await Promise.all([creditRequestsFor(month), listBatches()]);
  return NextResponse.json({
    ok: true, month, batch, counts: batch ? batchCounts(batch.items) : null, requests,
    months: all.map((b) => ({ month: b.month, approvedAt: b.approvedAt ?? null, sent: b.items.filter((i) => i.status === "sent").length })),
    summaryDay: creditSummaryDay(month), applyDeadline: applyDeadline(month), today: etToday(),
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const by = await who();
  const month = typeof b?.month === "string" && /^\d{4}-\d{2}$/.test(b.month) ? b.month : etToday().slice(0, 7);
  switch (b?.action) {
    case "build": {
      const batch = await buildBatch({ by, origin: linkOrigin(req), notify: b?.notify === true });
      return NextResponse.json({ ok: true, batch, counts: batchCounts(batch.items) });
    }
    case "toggle": {
      const units = Array.isArray(b?.unitRefs) ? b.unitRefs.map(String) : [];
      const batch = await setSend(month, units, b?.send !== false, by);
      if (!batch) return NextResponse.json({ error: "No notices for that month." }, { status: 404 });
      if (batch.approvedAt) return NextResponse.json({ error: "These notices have already been sent." }, { status: 409 });
      return NextResponse.json({ ok: true, batch, counts: batchCounts(batch.items) });
    }
    case "send": {
      if (!isMailConfigured()) return NextResponse.json({ error: "Email is not configured." }, { status: 503 });
      const before = await getBatch(month);
      if (!before) return NextResponse.json({ error: "No notices for that month." }, { status: 404 });
      if (!before.items.some(willSend)) return NextResponse.json({ error: "Nothing is ticked to send." }, { status: 400 });
      const r = await sendBatch(month, by);
      await logAudit({ event: "tenant-notices.send", user: by, ip: auditIp(req), detail: `${month} · ${r.sent} sent · ${r.failed} failed · ${r.remaining} left` });
      return NextResponse.json({ ok: true, ...r, counts: r.batch ? batchCounts(r.batch.items) : null });
    }
    case "posted": {
      const r = await markPosted(month, String(b?.unitRef ?? ""), b?.posted !== false, by);
      if (!r) return NextResponse.json({ error: "No credit request for that tenant." }, { status: 404 });
      return NextResponse.json({ ok: true, request: r });
    }
    case "summary": {
      const r = await sendCreditSummary({ origin: linkOrigin(req), force: true });
      if (!r.sent) return NextResponse.json({ error: `The summary did not send: ${r.reason}` }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
