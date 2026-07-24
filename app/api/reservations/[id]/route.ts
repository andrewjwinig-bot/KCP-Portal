import { NextRequest, NextResponse } from "next/server";
import {
  getReservation,
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
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let next: Reservation = { ...r, updatedAt: now };

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
