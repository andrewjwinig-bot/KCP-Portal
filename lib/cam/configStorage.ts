// Server-only storage for per-tenant CAM / INS / RET configuration.
//
// One blob per unitRef (via the safe collection store) so two unit pages saved
// close together never overwrite each other. Previously every save did a
// read-modify-write of a single all-tenants manifest, which could silently drop
// a concurrent edit to this CAM source-of-truth. The old manifest is migrated
// into per-unit blobs on first read.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";
import { emptyCamConfig, sanitizeCamConfig, type CamConfig } from "./config";
import { seedCamConfig } from "./retailConfigSeed";

type Manifest = { configs: CamConfig[]; updatedAt: string };

const store = createCollectionStore<CamConfig>({
  prefix: "cam-config",
  keyOf: (c) => c.unitRef,
  legacy: { prefix: "cam-config-manifest", id: "all", extract: (b) => (b as Manifest)?.configs ?? [] },
});

export async function getCamConfig(unitRef: string): Promise<CamConfig | null> {
  const raw = await store.get(unitRef);
  if (!raw) return null;
  // Normalize the stored shape on read so legacy fields (e.g. earlier
  // schema variants) don't leak into the client and the new fields
  // always have sane defaults.
  return sanitizeCamConfig(unitRef, raw);
}

export async function getOrEmptyCamConfig(unitRef: string): Promise<CamConfig> {
  // Saved config wins; otherwise fall back to the CAMPRep seed (pre-populated
  // from the property's CAM workbook) so a tenant's card isn't blank before
  // anyone has edited it. Empty config only when neither exists.
  return (await getCamConfig(unitRef)) ?? seedCamConfig(unitRef) ?? emptyCamConfig(unitRef);
}

export async function saveCamConfig(config: CamConfig): Promise<CamConfig> {
  const next: CamConfig = { ...config, updatedAt: new Date().toISOString() };
  await store.set(config.unitRef, next);
  return next;
}
