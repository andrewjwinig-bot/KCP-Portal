import "server-only";
// The credit-card statement being coded, kept in the PORTAL (owner: "greg
// should see his charges and drew should see the charges from Andrew"). It
// used to live in the importer's browser alone, so nobody else could see a
// charge, let alone code it. One working statement at a time — the batch
// Harry is preparing; sending it to AvidXchange saves it to history and he
// clears it.

import { getJSON, storeJSON, deleteJSON } from "@/lib/storage";
import { cleanPatch, type Tx } from "./coding";

const PREFIX = "cc-working";
const KEY = "current";

export type WorkingStatement = {
  tx: Tx[];
  statementPeriodText: string;
  importedAt: string | null;
  importedBy: string | null;
  fileName: string;
  updatedAt: string;
};

export const EMPTY: WorkingStatement = { tx: [], statementPeriodText: "", importedAt: null, importedBy: null, fileName: "", updatedAt: "" };

export async function getWorking(): Promise<WorkingStatement> {
  const doc = (await getJSON(PREFIX, KEY)) as WorkingStatement | null;
  return doc ? { ...EMPTY, ...doc, tx: Array.isArray(doc.tx) ? doc.tx : [] } : EMPTY;
}

export async function saveWorking(doc: WorkingStatement): Promise<WorkingStatement> {
  const next = { ...doc, updatedAt: new Date().toISOString() };
  await storeJSON(PREFIX, KEY, next);
  return next;
}

/** Code one charge — only its coding fields, read fresh so another person's
 *  coding of a different charge is never written back over. */
export async function patchCharge(id: string, patch: Record<string, unknown>): Promise<Tx | null> {
  const doc = await getWorking();
  const i = doc.tx.findIndex((t) => t.id === id);
  if (i < 0) return null;
  doc.tx[i] = { ...doc.tx[i], ...cleanPatch(patch) };
  await saveWorking(doc);
  return doc.tx[i];
}

export async function clearWorking(): Promise<void> {
  await deleteJSON(PREFIX, KEY);
}
