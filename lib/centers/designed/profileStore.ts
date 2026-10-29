import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { TenantProfile } from "./sync";

// The tenant details Harry enters for a designed center page — one document per
// property code, keyed by the DESIGNED suite id ("416"). `logo` is the private
// blob URL as uploaded; the render routes it through centerImageSrc.

export type StoredProfile = TenantProfile & { updatedBy?: string; updatedAt?: string };

const PREFIX = "center-tenant-profiles";

export async function getTenantProfiles(code: string): Promise<Record<string, StoredProfile>> {
  return ((await getJSON(PREFIX, code.toUpperCase())) as Record<string, StoredProfile> | null) ?? {};
}

export async function saveTenantProfile(code: string, suite: string, profile: StoredProfile): Promise<void> {
  const all = await getTenantProfiles(code);
  all[suite] = profile;
  await storeJSON(PREFIX, code.toUpperCase(), all);
}
