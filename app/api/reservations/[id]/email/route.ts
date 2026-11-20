import { NextRequest, NextResponse } from "next/server";
import {
  getReservation,
  newNoteId,
  saveReservation,
} from "@/lib/reservations/storage";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { staffMessageEmail } from "@/lib/maintenance/confirmationEmail";
import { prettyDate } from "@/lib/reservations/emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/reservations/:id/email
// Body: { author: string, subject: string, body: string }
// Sends a custom email to the reservation's contactEmail via Postmark and
// records an internal note for audit.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isMailConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured. Set POSTMARK_SERVER_TOKEN and MAINTENANCE_REPLY_FROM." },
      { status: 503 },
    );
  }
  const r = await getReservation(params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!r.contactEmail) return NextResponse.json({ error: "No contact email on file." }, { status: 400 });

  let body: { author?: string; subject?: string; body?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const author = String(body.author ?? "").trim() || "Staff";
  const subject = String(body.subject ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!subject) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
  if (!text) return NextResponse.json({ error: "Message body is required" }, { status: 400 });

  const m = staffMessageEmail({
    propertyCode: r.propertyCode, subject, eyebrow: "Conference Room Reservation", body: text, signedBy: author,
    details: [["Room", [r.roomLabel, r.propertyName].filter(Boolean).join(" · ")], ["Date", prettyDate(r.date)], ["Reference", r.id]],
  });
  const sent = await sendMail({ to: r.contactEmail, subject, textBody: m.text, htmlBody: m.html });
  if (!sent) return NextResponse.json({ error: "Email send failed" }, { status: 502 });

  const now = new Date().toISOString();
  const next = {
    ...r,
    updatedAt: now,
    notes: [
      ...r.notes,
      {
        id: newNoteId(),
        author,
        text: `Emailed tenant (${r.contactEmail}) — Subject: ${subject}\n\n${text}`,
        createdAt: now,
      },
    ],
  };
  await saveReservation(next);
  return NextResponse.json({ ok: true, reservation: next });
}
