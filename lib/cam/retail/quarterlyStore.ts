// Storage for manually-entered quarterly CAM/RET billing figures (Wawa @ 9510,
// etc.). Keyed by "<billingKey>-<year>". Sparse — only filled cells persist.

import { getJSON, storeJSON } from "@/lib/storage";
import { emptyQuarterlyData, type Quarter, type QuarterlyData } from "./quarterly";

const PREFIX = "cam-retail-quarterly";

function storeKey(key: string, year: number): string {
  return `${key}-${year}`;
}

export async function getQuarterly(key: string, year: number): Promise<QuarterlyData> {
  const data = (await getJSON(PREFIX, storeKey(key, year))) as QuarterlyData | null;
  if (!data) return emptyQuarterlyData();
  return { camCosts: data.camCosts ?? {}, retCosts: data.retCosts ?? {}, billed: data.billed ?? {} };
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
  const d = await getQuarterly(key, year);
  if (field === "camCost") {
    const row = { ...(d.camCosts[label] ?? {}) };
    if (value === null) delete row[quarter];
    else row[quarter] = value;
    if (Object.keys(row).length === 0) delete d.camCosts[label];
    else d.camCosts[label] = row;
  } else {
    const target = field === "retCost" ? d.retCosts : d.billed;
    if (value === null) delete target[quarter];
    else target[quarter] = value;
  }
  await storeJSON(PREFIX, storeKey(key, year), d);
  return d;
}
