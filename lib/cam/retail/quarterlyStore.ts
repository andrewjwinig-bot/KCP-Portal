// Storage for manually-entered quarterly CAM/RET billing figures (Wawa @ 9510,
// etc.). Keyed by "<billingKey>-<year>". Sparse — only filled cells persist.

import { scopedMap } from "@/lib/collectionStore";
import { emptyQuarterlyData, type Quarter, type QuarterlyData } from "./quarterly";

const storeKey = (key: string, year: number): string => `${key}-${year}`;

// One blob per row (each CAM line, plus "ret" and "billed") instead of the whole
// grid in a single blob that every cell save read-modify-wrote. Concurrent edits
// to different lines no longer clobber each other. Legacy per-scope blob is
// migrated on first read.
type QRow = Partial<Record<Quarter, number>>;
const grid = scopedMap<QRow>({
  prefix: "cam-retail-quarterly-v2",
  legacyForScope: (scope) => ({
    prefix: "cam-retail-quarterly",
    id: scope,
    extract: (b) => {
      const d = b as QuarterlyData | null;
      const out: Record<string, QRow> = {};
      for (const [label, row] of Object.entries(d?.camCosts ?? {})) out[`cam:${label}`] = row;
      if (d?.retCosts && Object.keys(d.retCosts).length) out["ret"] = d.retCosts;
      if (d?.billed && Object.keys(d.billed).length) out["billed"] = d.billed;
      return out;
    },
  }),
});

export async function getQuarterly(key: string, year: number): Promise<QuarterlyData> {
  const all = await grid.forScope(storeKey(key, year)).all();
  const out = emptyQuarterlyData();
  for (const [k, row] of Object.entries(all)) {
    if (k === "ret") out.retCosts = row;
    else if (k === "billed") out.billed = row;
    else if (k.startsWith("cam:")) out.camCosts[k.slice(4)] = row;
  }
  return out;
}

export type QuarterlyField = "camCost" | "retCost" | "billed";

/** Persist a single cell. value null clears it. For camCost, `label` is the
 *  CAM line; for retCost / billed, `label` is ignored. */
export async function saveQuarterlyCell(
  key: string,
  year: number,
  field: QuarterlyField,
  label: string,
  quarter: Quarter,
  value: number | null,
): Promise<QuarterlyData> {
  const scope = grid.forScope(storeKey(key, year));
  const rowKey = field === "camCost" ? `cam:${label}` : field === "retCost" ? "ret" : "billed";
  const row: QRow = { ...((await scope.get(rowKey)) ?? {}) };
  if (value === null) delete row[quarter];
  else row[quarter] = value;
  if (Object.keys(row).length === 0) await scope.remove(rowKey);
  else await scope.set(rowKey, row);
  return await getQuarterly(key, year);
}
