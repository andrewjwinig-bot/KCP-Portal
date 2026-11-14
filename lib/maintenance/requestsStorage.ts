// Server-only storage for MaintenanceRequest records.
//
// All requests live in a single manifest blob — one read per page load,
// one read+write per mutation. This is dramatically cheaper than the old
// "one blob per record + list() every read" layout, which was the cause
// of the Vercel Blob advanced-operation quota exhaustion that paused the
// store. On first read after this code ships we lazily migrate any
// surviving per-record blobs into the manifest (one-time list() cost).

import "server-only";
import { getJSON, listJSON, storeJSON } from "@/lib/storage";
import { normalizeRequest, type MaintenanceRequest } from "@/lib/maintenance/requests";

// Manifest lives in its own prefix so it never collides with — or gets
// re-included by — legacy per-record blobs in `maintenance-requests/`.
const MANIFEST_PREFIX = "maintenance-manifest";
const MANIFEST_ID = "requests";
const LEGACY_PREFIX = "maintenance-requests";

type Manifest = { requests: MaintenanceRequest[]; updatedAt: string };

async function loadManifest(): Promise<MaintenanceRequest[]> {
  const m = (await getJSON(MANIFEST_PREFIX, MANIFEST_ID)) as Manifest | null;
  if (m && Array.isArray(m.requests)) return m.requests.map(normalizeRequest);

  // Bootstrap path: no manifest exists yet. Pull whatever per-record
  // blobs the legacy prefix still has (one list() call), build the
  // manifest, save it. Future reads bypass list() entirely.
  let legacy: MaintenanceRequest[] = [];
  try {
    legacy = (await listJSON(LEGACY_PREFIX)) as MaintenanceRequest[];
  } catch {
    legacy = [];
  }
  await saveManifest(legacy);
  return legacy.map(normalizeRequest);
}

async function saveManifest(requests: MaintenanceRequest[]): Promise<void> {
  const payload: Manifest = { requests, updatedAt: new Date().toISOString() };
  await storeJSON(MANIFEST_PREFIX, MANIFEST_ID, payload);
}

export async function listRequests(): Promise<MaintenanceRequest[]> {
  const reqs = await loadManifest();
  // Sort defensively in case the manifest got out of order.
  return [...reqs].sort((a, b) =>
    (b.submittedDate || b.createdAt).localeCompare(a.submittedDate || a.createdAt),
  );
}

export async function getRequest(id: string): Promise<MaintenanceRequest | null> {
  const reqs = await loadManifest();
  return reqs.find((r) => r.id === id) ?? null;
}

export async function saveRequest(r: MaintenanceRequest): Promise<void> {
  const reqs = await loadManifest();
  const idx = reqs.findIndex((x) => x.id === r.id);
  if (idx >= 0) reqs[idx] = r;
  else reqs.unshift(r);
  await saveManifest(reqs);
}

export async function removeRequest(id: string): Promise<boolean> {
  const reqs = await loadManifest();
  const next = reqs.filter((r) => r.id !== id);
  if (next.length === reqs.length) return false;
  await saveManifest(next);
  return true;
}
