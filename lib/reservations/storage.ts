// Reservation data model + storage. Single-manifest pattern (same as
// maintenance requests) to keep Vercel Blob advanced-operation usage
// minimal: one GET per page load, one GET+PUT per mutation.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

export const RESERVATION_STATUSES = ["Pending", "Approved", "Declined"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export type ReservationNote = {
  id: string;
  author: string;            // staff name (e.g., "Nancy", "Greg") or "Tenant Submission"
  text: string;
  createdAt: string;
};

export type Reservation = {
  id: string;
  roomUnitRef: string;
  roomLabel: string;
  propertyCode: string;
  propertyName: string;
  tenantCompany: string;
  tenantResolved: boolean;   // false → typed name didn't match the rent roll; needs staff assignment
  contactFirstName: string;
  contactLastName: string;
  contactEmail: string;
  contactPhone: string;
  date: string;              // ISO YYYY-MM-DD
  startTime: string;         // 24h HH:MM
  endTime: string;           // 24h HH:MM
  purpose: string;
  status: ReservationStatus;
  decidedAt: string | null;  // ISO timestamp
  decidedBy: string | null;  // staff name
  notes: ReservationNote[];
  createdAt: string;
  updatedAt: string;
};

const MANIFEST_PREFIX = "reservations-manifest";
const MANIFEST_ID = "all";

type Manifest = { reservations: Reservation[]; updatedAt: string };

async function loadManifest(): Promise<Reservation[]> {
  const m = (await getJSON(MANIFEST_PREFIX, MANIFEST_ID)) as Manifest | null;
  if (m && Array.isArray(m.reservations)) return m.reservations;
  await saveManifest([]);
  return [];
}

async function saveManifest(reservations: Reservation[]): Promise<void> {
  await storeJSON(MANIFEST_PREFIX, MANIFEST_ID, {
    reservations,
    updatedAt: new Date().toISOString(),
  });
}

export async function listReservations(): Promise<Reservation[]> {
  const all = await loadManifest();
  // Newest-first ordering for the admin list.
  return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getReservation(id: string): Promise<Reservation | null> {
  const all = await loadManifest();
  return all.find((r) => r.id === id) ?? null;
}

export async function saveReservation(r: Reservation): Promise<void> {
  const all = await loadManifest();
  const idx = all.findIndex((x) => x.id === r.id);
  if (idx >= 0) all[idx] = r;
  else all.unshift(r);
  await saveManifest(all);
}

export async function removeReservation(id: string): Promise<boolean> {
  const all = await loadManifest();
  const next = all.filter((x) => x.id !== id);
  if (next.length === all.length) return false;
  await saveManifest(next);
  return true;
}

export function newReservationId(): string {
  return "rsv_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function newNoteId(): string {
  return "rnote_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
