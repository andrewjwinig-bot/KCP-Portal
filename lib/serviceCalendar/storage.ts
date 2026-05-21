// Service-calendar storage. Single-manifest pattern (same as reservations /
// maintenance). One GET per page load, one GET+PUT per mutation.
//
// First read seeds the manifest from SERVICE_CALENDAR_SEED so Gregory opens
// the page to a pre-populated schedule that he can edit as he sees fit.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { SERVICE_CALENDAR_SEED } from "./seed";

export type ServiceItem = {
  id: string;
  propertyLabel: string;   // e.g. "2300", "7010 Retail"
  service: string;         // e.g. "Sprinkler Inspections"
  months: number[];        // 1-12 — months the service recurs each year
  amount: number;          // dollars per occurrence
  notes: string;
  createdAt: string;
  updatedAt: string;
};

const MANIFEST_PREFIX = "service-calendar-manifest";
const MANIFEST_ID = "all";

type Manifest = { items: ServiceItem[]; seeded: boolean; updatedAt: string };

async function loadManifest(): Promise<ServiceItem[]> {
  const m = (await getJSON(MANIFEST_PREFIX, MANIFEST_ID)) as Manifest | null;
  if (m && Array.isArray(m.items) && m.seeded) return m.items;
  const items = SERVICE_CALENDAR_SEED();
  await saveManifest(items);
  return items;
}

async function saveManifest(items: ServiceItem[]): Promise<void> {
  await storeJSON(MANIFEST_PREFIX, MANIFEST_ID, {
    items,
    seeded: true,
    updatedAt: new Date().toISOString(),
  });
}

export async function listServiceItems(): Promise<ServiceItem[]> {
  return loadManifest();
}

export async function saveServiceItem(item: ServiceItem): Promise<void> {
  const all = await loadManifest();
  const idx = all.findIndex((x) => x.id === item.id);
  const next: ServiceItem = { ...item, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  await saveManifest(all);
}

export async function removeServiceItem(id: string): Promise<boolean> {
  const all = await loadManifest();
  const next = all.filter((x) => x.id !== id);
  if (next.length === all.length) return false;
  await saveManifest(next);
  return true;
}

export function newServiceItemId(): string {
  return "svc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
