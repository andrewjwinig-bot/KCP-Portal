// Per-owner K-1 email overrides.
//
// Keyed by OWNER ID, not by name. That is the whole point: the name-keyed
// sources (owner contacts, the trustee directory) miss most of the roster
// because they were built for different purposes, and anything typed in here
// sidesteps name matching entirely. It also lets one person's two interests
// carry different addresses — a trust's mail often goes to its trustee.

import "server-only";
import { createMapStore } from "@/lib/collectionStore";

export type OwnerEmailOverride = {
  email: string;
  setBy: string | null;
  at: string;
};

const store = createMapStore<OwnerEmailOverride>({ prefix: "investor-owner-emails" });

export async function allOwnerEmails(): Promise<Record<string, OwnerEmailOverride>> {
  return store.all();
}

export async function setOwnerEmail(ownerId: string, value: OwnerEmailOverride): Promise<void> {
  await store.set(ownerId, value);
}

export async function clearOwnerEmail(ownerId: string): Promise<void> {
  await store.remove(ownerId);
}
