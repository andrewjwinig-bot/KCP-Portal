import { NextRequest, NextResponse } from "next/server";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { reservationDecisionEmail, reservationModifiedEmail, prettyTime } from "@/lib/reservations/emails";
import { applyReschedule, slotConflicts, slotError, type Slot } from "@/lib/reservations/reschedule";
import { roomByUnitRef } from "@/lib/reservations/rooms";
import {
  getReservation,
  listReservations,
  newNoteId,
  RESERVATION_STATUSES,
  removeReservation,
  saveReservation,
  type Reservation,
  type ReservationStatus,
} from "@/lib/reservations/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await getReservation(params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ reservation: r });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await getReservation(params.id);
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: {
    status?: string;
    decidedBy?: string;
    tenantCompany?: string;
    addNote?: { author: string; text: string };
    /** Staff modify & book: move it to this room / date / time, approve it,
     *  and email the tenant the new time (with `message`, optional). */
    reschedule?: Slot & { message?: string; notify?: boolean };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let next: Reservation = { ...r, updatedAt: now };

  if (body.reschedule) {
    const s = body.reschedule;
    const slot: Slot = { roomUnitRef: String(s.roomUnitRef ?? ""), date: String(s.date ?? ""), startTime: String(s.startTime ?? ""), endTime: String(s.endTime ?? "") };
    const room = roomByUnitRef(slot.roomUnitRef);
    if (!room) return NextResponse.json({ error: "Pick a valid room." }, { status: 400 });
    const bad = slotError(slot);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
    const clash = slotConflicts(await listReservations(), slot, r.id);
    if (clash.length) {
      const taken = clash.map((c) => `${prettyTime(c.startTime)}–${prettyTime(c.endTime)} (${c.tenantCompany})`).join(", ");
      return NextResponse.json({ error: `That time is already booked: ${taken}.` }, { status: 409 });
    }
    const by = String(body.decidedBy ?? "").trim() || "Staff";
    const moved = applyReschedule(r, slot, room, by, now);
    const message = String(s.message ?? "").trim();
    const notify = s.notify !== false && !!moved.contactEmail && isMailConfigured();
    let emailed = false;
    if (notify) {
      try {
        const m = reservationModifiedEmail(moved, message, by);
        emailed = await sendMail({ to: moved.contactEmail, subject: m.subject, htmlBody: m.html, textBody: m.text });
      } catch { emailed = false; }
    }
    const from = `${r.roomLabel !== moved.roomLabel || r.propertyName !== moved.propertyName ? `${r.roomLabel} (${r.propertyName}) ` : ""}${r.date} ${prettyTime(r.startTime)}–${prettyTime(r.endTime)}`;
    const to = `${moved.roomLabel !== r.roomLabel || r.propertyName !== moved.propertyName ? `${moved.roomLabel} (${moved.propertyName}) ` : ""}${moved.date} ${prettyTime(moved.startTime)}–${prettyTime(moved.endTime)}`;
    moved.notes = [...moved.notes, {
      id: newNoteId(), author: by, createdAt: now,
      text: `Modified and booked: ${from} → ${to}. ${emailed ? `Emailed ${moved.contactEmail}.` : "Tenant NOT emailed."}${message ? `\n\n${message}` : ""}`,
    }];
    try {
      await saveReservation(moved);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to save" }, { status: 500 });
    }
    return NextResponse.json({ reservation: moved, emailed });
  }

  if (body.status && (RESERVATION_STATUSES as readonly string[]).includes(body.status)) {
    next.status = body.status as ReservationStatus;
    if (next.status !== "Pending") {
      next.decidedAt = now;
      next.decidedBy = body.decidedBy ?? null;
    } else {
      next.decidedAt = null;
      next.decidedBy = null;
    }
  }

  if (typeof body.tenantCompany === "string") {
    next.tenantCompany = body.tenantCompany.trim();
    next.typedCompany = undefined;
    // Staff picked a rent-roll tenant — the request is now resolved.
    next.tenantResolved = true;
  }

  if (body.addNote && body.addNote.text.trim()) {
    next = {
      ...next,
      notes: [
        ...next.notes,
        {
          id: newNoteId(),
          author: body.addNote.author?.trim() || "Staff",
          text: body.addNote.text.trim(),
          createdAt: now,
        },
      ],
    };
  }

  try {
    await saveReservation(next);
    // Tell the tenant when staff approve or decline (the confirmation
    // promises it). Only on an actual change, and only with an email.
    if (next.status !== r.status && next.status !== "Pending" && next.contactEmail && isMailConfigured()) {
      try {
        const m = reservationDecisionEmail(next);
        await sendMail({ to: next.contactEmail, subject: m.subject, htmlBody: m.html, textBody: m.text, isAutoReply: true });
      } catch { /* the decision still saves */ }
    }
    return NextResponse.json({ reservation: next });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = await removeReservation(params.id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
