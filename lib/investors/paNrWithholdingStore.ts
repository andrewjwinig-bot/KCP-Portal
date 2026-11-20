// One document per property per distribution year (`pa-nr-withholding`,
// `<code>-<year>`). A year never saved reads `startingDoc` (the owner's
// workbook in its own year).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import { startingDoc, type WithholdingDoc } from "./paNrWithholding";

const PREFIX = "pa-nr-withholding";
const key = (code: string, year: number) => `${code.toUpperCase()}-${year}`;

export async function getWithholdingDoc(code: string, year: number): Promise<{ doc: WithholdingDoc; saved: boolean }> {
  const stored = (await getJSON(PREFIX, key(code, year), { retryOnMiss: true })) as WithholdingDoc | null;
  return stored ? { doc: stored, saved: true } : { doc: startingDoc(code, year), saved: false };
}

export async function setWithholdingDoc(code: string, year: number, doc: WithholdingDoc): Promise<void> {
  await storeJSON(PREFIX, key(code, year), doc);
}
