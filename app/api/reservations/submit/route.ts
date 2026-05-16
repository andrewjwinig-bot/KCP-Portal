import { NextRequest, NextResponse } from "next/server";
import {
  listReservations,
  newNoteId,
  newReservationId,
  saveReservation,
  type Reservation,
} from "@/lib/reservations/storage";
import { roomByUnitRef } from "@/lib/reservations/rooms";
import { findConflicts } from "@/lib/reservations/conflict";
import { upsertContact } from "@/lib/maintenance/tenants";
import { companiesForProperty } from "@/lib/tenants/companies";
import { bestTenantMatch } from "@/lib/tenants/match";
import { sendMail } from "@/lib/mail";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

// Public submission endpoint. Same honeypot + rate-limit + middleware
// exemption pattern as /api/maintenance/submit.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PER_HOUR = 5;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`reservation:${ip}`, RATE_LIMIT_PER_HOUR)) {
    return NextResponse.json(
      { error: "Too many submissions from this address. Try again later." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot — silently accept-and-ignore.
  if (String(body.website ?? "").trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const roomUnitRef = String(body.roomUnitRef ?? "").trim();
  const tenantCompany = String(body.tenantCompany ?? "").trim();
  const firstName = String(body.firstName ?? "").trim();
  const lastName = String(body.lastName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const date = String(body.date ?? "").trim();
  const startTime = String(body.startTime ?? "").trim();
  const endTime = String(body.endTime ?? "").trim();
  const purpose = String(body.purpose ?? "").trim();

  const room = roomByUnitRef(roomUnitRef);
  if (!room) return NextResponse.json({ error: "Pick a valid room" }, { status: 400 });
  if (!tenantCompany) return NextResponse.json({ error: "Tenant is required" }, { status: 400 });
  if (!firstName || !lastName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Pick a valid date" }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json({ error: "Pick a valid time range" }, { status: 400 });
  }
  if (startTime >= endTime) {
    return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
  }

  // Business-hours window: Mon–Fri only, 8:00–18:00, 15-minute increments.
  const [y, mo, d] = date.split("-").map(Number);
  const dow = new Date(y, mo - 1, d).getDay();
  if (dow === 0 || dow === 6) {
    return NextResponse.json(
      { error: "Reservations are only available Monday through Friday." },
      { status: 400 },
    );
  }
  if (startTime < "08:00" || endTime > "18:00") {
    return NextResponse.json(
      { error: "Reservation times must be between 8:00 AM and 6:00 PM." },
      { status: 400 },
    );
  }
  const minutesOf = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };
  if (minutesOf(startTime) % 15 !== 0 || minutesOf(endTime) % 15 !== 0) {
    return NextResponse.json(
      { error: "Pick start and end times in 15-minute increments." },
      { status: 400 },
    );
  }

  // Conflict check — block submissions that overlap an existing Approved
  // reservation for the same room on the same date.
  const existing = await listReservations();
  const conflicts = findConflicts(existing, room.unitRef, date, startTime, endTime);
  if (conflicts.length > 0) {
    const taken = conflicts
      .map((c) => `${prettyTime(c.startTime)}–${prettyTime(c.endTime)} (${c.tenantCompany})`)
      .join(", ");
    return NextResponse.json(
      {
        error: `That time slot is already booked: ${taken}. Please pick another time or room.`,
        conflicts,
      },
      { status: 409 },
    );
  }

  // Auto-resolve the free-text company name to a canonical rent-roll
  // tenant. When nothing matches confidently, keep the typed name and flag
  // the reservation so the admin list highlights it for assignment.
  const companies = await companiesForProperty(room.propertyCode);
  const match = bestTenantMatch(tenantCompany, companies.map((c) => c.name));
  const resolvedCompany = match ? match.name : tenantCompany;
  const tenantResolved = match != null;

  const now = new Date().toISOString();
  const r: Reservation = {
    id: newReservationId(),
    roomUnitRef: room.unitRef,
    roomLabel: room.label,
    propertyCode: room.propertyCode,
    propertyName: room.propertyName,
    tenantCompany: resolvedCompany,
    tenantResolved,
    contactFirstName: firstName,
    contactLastName: lastName,
    contactEmail: email,
    contactPhone: phone,
    date,
    startTime,
    endTime,
    purpose,
    status: "Pending",
    decidedAt: null,
    decidedBy: null,
    notes: purpose
      ? [{
          id: newNoteId(),
          author: "Tenant Submission",
          text: purpose,
          createdAt: now,
        }]
      : [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await saveReservation(r);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save reservation" },
      { status: 500 },
    );
  }

  // Persist the contact so future submissions can autofill.
  try {
    await upsertContact({
      firstName,
      lastName,
      email,
      phone,
      company: tenantCompany,
      propertyCode: room.propertyCode,
    });
  } catch { /* ignore */ }

  // Best-effort confirmation email.
  try {
    await sendMail({
      to: email,
      subject: `Reservation request received — ${room.label}, ${room.propertyName}`,
      textBody: confirmationBody(r),
      isAutoReply: true,
    });
  } catch { /* ignore */ }

  return NextResponse.json({ ok: true, id: r.id }, { status: 201 });
}

function confirmationBody(r: Reservation): string {
  const greet = r.contactFirstName ? `Hi ${r.contactFirstName},` : "Hi,";
  return [
    greet,
    "",
    `Thanks for submitting a reservation request for the ${r.roomLabel} at ${r.propertyName}. Our team will review and confirm shortly.`,
    "",
    `Room:    ${r.roomLabel} (${r.propertyName})`,
    `Date:    ${prettyDate(r.date)}`,
    `Time:    ${prettyTime(r.startTime)} – ${prettyTime(r.endTime)}`,
    r.purpose ? `Purpose: ${r.purpose}` : null,
    `Reference ID: ${r.id}`,
    "",
    "Your reservation is currently PENDING. You'll receive another email once it's approved.",
    "",
    "— KCP Property Management",
  ].filter((l) => l !== null).join("\n");
}

function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function prettyTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${m[2]} ${ampm}`;
}
