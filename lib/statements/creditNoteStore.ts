// Follow-up notes on the Open Credit tracker — the notes column of the team's
// spreadsheet ("12/2/25 sent email", "In LEGAL", "Dup Pymt of July CAM").
// Keyed by UNIT, not month: a credit that sits for months keeps its history.

import "server-only";
import { createCollectionStore } from "@/lib/collectionStore";

export type CreditNote = { unitRef: string; text: string; by: string | null; at: string };

const store = createCollectionStore<CreditNote>({
  prefix: "tenant-statement-credit-notes",
  keyOf: (n) => n.unitRef,
});

const key = (unitRef: string) => unitRef.trim().toUpperCase();

export async function creditNotes(): Promise<Record<string, CreditNote>> {
  const all = (await store.all()).filter(Boolean);
  return Object.fromEntries(all.map((n) => [key(n.unitRef), n]));
}

/** Empty text removes the note. */
export async function setCreditNote(unitRef: string, text: string, by: string | null): Promise<CreditNote | null> {
  const k = key(unitRef);
  const t = text.trim().slice(0, 1000);
  if (!t) { await store.remove(k); return null; }
  const note = { unitRef: k, text: t, by, at: new Date().toISOString() };
  await store.set(k, note);
  return note;
}
