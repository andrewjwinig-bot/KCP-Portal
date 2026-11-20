// Server-only storage for SharePoint folder links — one URL per unit
// (by unitRef) and per property (by property code). Single-manifest
// pattern, same as suite information / deposits.

import "server-only";
import { createMapStore } from "@/lib/collectionStore";

export type ShareLinkKind = "unit" | "property";

export type ShareLinks = {
  units: Record<string, string>;
  properties: Record<string, string>;
  updatedAt: string;
};

// One blob per link, keyed `${kind}:${key}` (was a single manifest holding both
// maps, read-modify-written on every link edit). Legacy manifest migrated on
// first read.
const store = createMapStore<string>({
  prefix: "share-folder-links-v2",
  legacy: {
    prefix: "share-folder-links",
    id: "all",
    extract: (b) => {
      const m = b as Partial<ShareLinks> | null;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(m?.units ?? {})) out[`unit:${k}`] = v;
      for (const [k, v] of Object.entries(m?.properties ?? {})) out[`property:${k}`] = v;
      return out;
    },
  },
});

export async function getShareLinks(): Promise<ShareLinks> {
  const all = await store.all();
  const units: Record<string, string> = {};
  const properties: Record<string, string> = {};
  for (const [ck, url] of Object.entries(all)) {
    const i = ck.indexOf(":");
    const kind = ck.slice(0, i);
    const key = ck.slice(i + 1);
    if (kind === "unit") units[key] = url;
    else if (kind === "property") properties[key] = url;
  }
  return { units, properties, updatedAt: new Date().toISOString() };
}

// Set or clear (empty url) a single link. Returns the updated manifest.
export async function setShareLink(
  kind: ShareLinkKind,
  key: string,
  url: string,
): Promise<ShareLinks> {
  const ck = `${kind}:${key}`;
  if (url) await store.set(ck, url);
  else await store.remove(ck);
  return getShareLinks();
}
