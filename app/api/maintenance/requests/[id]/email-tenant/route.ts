import { NextRequest, NextResponse } from "next/server";
import {
  applyPatch,
  newNoteId,
  type Note,
} from "@/lib/maintenance/requests";
import { getRequest, saveRequest } from "@/lib/maintenance/requestsStorage";
import { isStaffId, staffName } from "@/lib/maintenance/staff";
import { isMailConfigured, sendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/maintenance/requests/:id/email-tenant
// Body: { from: StaffId, subject: string, body: string }
// Sends an outbound email to the request's tenantEmail via Postmark and
// records an internal note with the timestamp + author + subject for audit.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured. Set POSTMARK_SERVER_TOKEN and MAINTENANCE_REPLY_FROM." },
      { status: 503 },
    );
  }
  const r = await getRequest(params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!r.tenantEmail) {
    return NextResponse.json({ error: "Request has no tenant email on file." }, { status: 400 });
  }

  let body: { from?: string; subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fromId = isStaffId(body.from ?? "") ? body.from! : "greg";
  const subject = String(body.subject ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Message body is required" }, { status: 400 });

  const sent = await sendMail({ to: r.tenantEmail, subject, textBody: text });
  if (!sent) {
    return NextResponse.json({ error: "Email send failed" }, { status: 502 });
  }

  // Audit note so the team has a record of what got sent.
  const note: Note = {
    id: newNoteId(),
    author: isStaffId(fromId) ? fromId : "admin",
    authorName: isStaffId(fromId) ? staffName(fromId) : "Admin",
    text: `Emailed tenant (${r.tenantEmail}) — Subject: ${subject}\n\n${text}`,
    createdAt: new Date().toISOString(),
  };
  const next = applyPatch(r, { notes: [...r.notes, note] });
  await saveRequest(next);

  return NextResponse.json({ ok: true, request: next });
}
