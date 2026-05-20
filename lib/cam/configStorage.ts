// Server-only storage for per-tenant CAM / INS / RET configuration.
// Single-manifest pattern (one GET per read, one GET+PUT per mutation).
// Keying by unitRef inside one JSON blob sidesteps storage.ts's
// safeId() stripping of unit refs.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { emptyCamConfig, sanitizeCamConfig, type CamConfig } from "./config";

const PREFIX = "cam-config-manifest";
const ID = "all";

type Manifest = { configs: CamConfig[]; updatedAt: string };

async function loadAll(): Promise<CamConfig[]> {
  const m = (await getJSON(PREFIX, ID)) as Manifest | null;
  return m && Array.isArray(m.configs) ? m.configs : [];
}

async function saveAll(configs: CamConfig[]): Promise<void> {
  await storeJSON(PREFIX, ID, { configs, updatedAt: new Date().toISOString() });
}

export async function getCamConfig(unitRef: string): Promise<CamConfig | null> {
  const all = await loadAll();
  const raw = all.find((c) => c.unitRef === unitRef);
  if (!raw) return null;
  // Normalize the stored shape on read so legacy fields (e.g. earlier
  // schema variants) don't leak into the client and the new fields
  // always have sane defaults.
  return sanitizeCamConfig(unitRef, raw);
}

export async function getOrEmptyCamConfig(unitRef: string): Promise<CamConfig> {
  return (await getCamConfig(unitRef)) ?? emptyCamConfig(unitRef);
}

export async function saveCamConfig(config: CamConfig): Promise<CamConfig> {
  const all = await loadAll();
  const next: CamConfig = { ...config, updatedAt: new Date().toISOString() };
  const idx = all.findIndex((c) => c.unitRef === config.unitRef);
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  await saveAll(all);
  return next;
}
