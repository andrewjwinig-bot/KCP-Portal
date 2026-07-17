// Tenant CAM-link records — one per issued link, so a link can be listed,
// revoked, and its views logged. The token is unforgeable on its own; this store
// adds revocation + an access trail (who opened it, when).

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import type { TenantLinkKind } from "./token";

export type TenantLink = {
  id: string;
  property: string;
  unitRef: string;
  year: number;
  kind: TenantLinkKind;
  tenantName: string;
  createdAt: string;
  createdBy?: string;
  revoked: boolean;
  expiresAt?: string | null;
  /** Optional access PIN the tenant must enter before the portal loads. Stored
   *  as-is (admin-only store) so staff can re-share it; a signed short-lived
   *  cookie proves entry so it isn't sent on every request. Absent/null = no PIN. */
  pin?: string | null;
  /** Access trail — capped list of recent views. */
  views: { at: string; ip?: string }[];
  lastViewedAt?: string | null;
  viewCount: number;
};

const store = createCollectionStore<TenantLink>({ prefix: "cam-tenant-links", keyOf: (l) => l.id });

export async function saveTenantLink(rec: TenantLink): Promise<void> {
  await store.set(rec.id, rec);
}
export async function getTenantLink(id: string): Promise<TenantLink | null> {
  return (await store.get(id)) ?? null;
}
export async function listTenantLinks(): Promise<TenantLink[]> {
  return store.all();
}
export async function linksForUnit(unitRef: string, year: number): Promise<TenantLink[]> {
  return (await store.all()).filter((l) => l.unitRef === unitRef && l.year === year);
}
export async function revokeTenantLink(id: string): Promise<boolean> {
  const rec = await store.get(id);
  if (!rec) return false;
  rec.revoked = true;
  await store.set(id, rec);
  return true;
}
export async function deleteTenantLink(id: string): Promise<void> {
  await store.remove(id);
}

/** Record a view (best-effort; caps the trail at 50). */
export async function logTenantLinkView(id: string, ip?: string): Promise<void> {
  const rec = await store.get(id);
  if (!rec) return;
  const at = new Date().toISOString();
  rec.views = [...(rec.views ?? []), { at, ip }].slice(-50);
  rec.lastViewedAt = at;
  rec.viewCount = (rec.viewCount ?? 0) + 1;
  await store.set(id, rec);
}
