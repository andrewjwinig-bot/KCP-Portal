// Server-only storage for SharePoint folder links — one URL per unit
// (by unitRef) and per property (by property code). Single-manifest
// pattern, same as suite information / deposits.

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";

const PREFIX = "share-folder-links";
const ID = "all";

export type ShareLinkKind = "unit" | "property";

export type ShareLinks = {
  units: Record<string, string>;
  properties: Record<string, string>;
  updatedAt: string;
};

function empty(): ShareLinks {
  return { units: {}, properties: {}, updatedAt: new Date().toISOString() };
}

export async function getShareLinks(): Promise<ShareLinks> {
  const m = (await getJSON(PREFIX, ID)) as Partial<ShareLinks> | null;
  return {
    units: m && typeof m.units === "object" && m.units ? m.units : {},
    properties: m && typeof m.properties === "object" && m.properties ? m.properties : {},
    updatedAt: m?.updatedAt ?? new Date().toISOString(),
  };
}

// Set or clear (empty url) a single link. Returns the updated manifest.
export async function setShareLink(
  kind: ShareLinkKind,
  key: string,
  url: string,
): Promise<ShareLinks> {
  const links = await getShareLinks();
  const bucket = kind === "unit" ? links.units : links.properties;
  if (url) bucket[key] = url;
  else delete bucket[key];
  const next: ShareLinks = { ...links, updatedAt: new Date().toISOString() };
  await storeJSON(PREFIX, ID, next);
  return next;
}
