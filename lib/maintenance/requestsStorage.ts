// Server-only storage helpers for MaintenanceRequest records. Kept separate
// from the pure types/constants file so client components can import types
// without pulling Node's `fs`/`fs-promises` into the bundle.

import "server-only";
import { deleteJSON, getJSON, listJSON, storeJSON } from "@/lib/storage";
import type { MaintenanceRequest } from "@/lib/maintenance/requests";

const PREFIX = "maintenance-requests";

export async function listRequests(): Promise<MaintenanceRequest[]> {
  const all = (await listJSON(PREFIX)) as MaintenanceRequest[];
  return all.sort((a, b) =>
    (b.submittedDate || b.createdAt).localeCompare(a.submittedDate || a.createdAt),
  );
}

export async function getRequest(id: string): Promise<MaintenanceRequest | null> {
  return (await getJSON(PREFIX, id)) as MaintenanceRequest | null;
}

export async function saveRequest(r: MaintenanceRequest): Promise<void> {
  await storeJSON(PREFIX, r.id, r);
}

export async function removeRequest(id: string): Promise<boolean> {
  return deleteJSON(PREFIX, id);
}
