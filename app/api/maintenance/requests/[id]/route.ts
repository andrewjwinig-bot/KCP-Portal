import { NextRequest, NextResponse } from "next/server";
import {
  applyPatch,
  newNoteId,
  type MaintenanceRequest,
  type Note,
} from "@/lib/maintenance/requests";
import { getRequest, removeRequest, saveRequest } from "@/lib/maintenance/requestsStorage";
import { isStaffId, staffName } from "@/lib/maintenance/staff";
import { isMailConfigured, sendMail } from "@/lib/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tenant-facing note when staff advance a request. Closes the loop so a tenant
// who submitted through the portal hears back on progress + completion.
function statusEmailBody(r: MaintenanceRequest): string {
  const greet = r.tenantName ? `Hi ${r.tenantName.split(/\s+/)[0]},` : "Hi,";
  const where = [r.propertyName, r.tenantSuite].filter(Boolean).join(" · ");
  const lines = [
    greet,
    "",
    r.status === "Complete"
      ? "Good news — your service request has been completed."
      : "An update on your service request: our team has started work on it.",
    "",
    where ? `Property: ${where}` : null,
    r.subject ? `Request: ${r.subject}` : null,
    `Reference ID: ${r.id}`,
    "",
    r.status === "Complete"
      ? "If anything still needs attention, reply to this email or submit a new request from your tenant portal."
      : "We'll let you know when it's complete. You can check status anytime in your tenant portal.",
    "",
    "— KCP Maintenance",
  ].filter((l): l is string => l !== null);
  return lines.join("\n");
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await getRequest(params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ request: r });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await getRequest(params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: Partial<MaintenanceRequest> & { addNote?: { author: string; text: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let next = applyPatch(r, body);

  // Assigning a request implicitly marks it as seen for everyone — the
  // assignee row needs to clear the NEW pill across the team, not just for
  // whoever clicked into it.
  if (body.assignedTo && !next.seenAt) {
    next = { ...next, seenAt: new Date().toISOString() };
  }

  if (body.addNote && body.addNote.text.trim()) {
    const authorRaw = String(body.addNote.author ?? "");
    const author: Note["author"] = isStaffId(authorRaw) ? authorRaw : "admin";
    const note: Note = {
      id: newNoteId(),
      author,
      authorName: author === "admin" ? "Admin" : staffName(author),
      text: body.addNote.text.trim(),
      createdAt: new Date().toISOString(),
    };
    next = { ...next, notes: [...next.notes, note], updatedAt: note.createdAt };
  }

  // Best-effort tenant notification when the status advances to In Progress or
  // Complete. Only fires on an actual change, and only when we have an email.
  const statusAdvanced = !!body.status && next.status !== r.status && (next.status === "In Progress" || next.status === "Complete");
  if (statusAdvanced && next.tenantEmail && isMailConfigured()) {
    try {
      await sendMail({
        to: next.tenantEmail,
        subject: next.status === "Complete"
          ? `Your service request is complete — ${next.propertyName || "KCP"}`
          : `Update on your service request — ${next.propertyName || "KCP"}`,
        textBody: statusEmailBody(next),
        isAutoReply: true,
      });
    } catch { /* ignore — the status change still saves */ }
  }

  try {
    await saveRequest(next);
    return NextResponse.json({ request: next });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = await removeRequest(params.id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
