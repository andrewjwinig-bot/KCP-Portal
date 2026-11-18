// Recoveries by line for any statement key — a building, a fund (its
// buildings combined), a shopping centre (7010's retail and office pots
// together), or a whole book ("all-bp" / "all-sc"). Read off the SAME
// reconciliation loaders the CAM recon page and the tenant statements use,
// so the figures are the recon's own (lib/cam/recoveries.ts).

import "server-only";
import { OFFICE_RECON_FIXTURES } from "./office/registry";
import { RETAIL_RECON_FIXTURES } from "./retail/registry";
import { loadOfficeRecon } from "./office/loadResult";
import { loadRetailRecon } from "./retail/loadResult";
import { officeLineRecoveries } from "./office/lineRecovery";
import { retailLineRecoveries } from "./retail/lineRecovery";
import { combineGroups, type RecoveryGroup } from "./recoveries";
import { OFFICE_BUILDINGS } from "@/lib/rentroll/baseYearExpenses";

const officeName = (code: string) => OFFICE_BUILDINGS.find((b) => b.code === code)?.name ?? code;
const JV3 = OFFICE_BUILDINGS.filter((b) => b.fund === "JV III").map((b) => b.code);
const NILLC = OFFICE_BUILDINGS.filter((b) => b.fund === "NI LLC").map((b) => b.code);
const RETAIL = Object.values(RETAIL_RECON_FIXTURES).filter((f) => !f.hidden).map((f) => f.propertyCode);

export const RECOVERY_SCOPES: { key: string; name: string }[] = [
  { key: "all-bp", name: "All Business Parks" },
  { key: "PJV3", name: "JV III" },
  { key: "PNIPLX", name: "NI LLC" },
  ...OFFICE_BUILDINGS.map((b) => ({ key: b.code, name: `${b.code} · ${b.name}` })),
  { key: "all-sc", name: "All Shopping Centers" },
  ...RETAIL.map((c) => ({ key: c, name: `${c} · ${RETAIL_RECON_FIXTURES[c].name}` })),
];

/** The buildings a statement key reconciles as (empty: no recon for it). */
export function recoveryMembers(key: string): { office: string[]; retail: string[] } {
  const k = key.toUpperCase();
  if (k === "ALL-BP") return { office: [...JV3, ...NILLC], retail: [] };
  if (k === "ALL-SC") return { office: [], retail: RETAIL };
  if (k === "PJV3") return { office: JV3, retail: [] };
  if (k === "PNIPLX") return { office: NILLC, retail: [] };
  if (OFFICE_RECON_FIXTURES[k]) return { office: [k], retail: [] };
  if (RETAIL_RECON_FIXTURES[k] && !RETAIL_RECON_FIXTURES[k].hidden) return { office: [], retail: [k] };
  return { office: [], retail: [] };
}

/** Years reconciled for any of the key's buildings, newest first. */
export function recoveryYears(key: string): number[] {
  const m = recoveryMembers(key);
  const ys = new Set<number>();
  for (const c of m.office) for (const y of Object.keys(OFFICE_RECON_FIXTURES[c]?.byYear ?? {})) ys.add(Number(y));
  for (const c of m.retail) for (const y of Object.keys(RETAIL_RECON_FIXTURES[c]?.byYear ?? {})) ys.add(Number(y));
  return [...ys].sort((a, b) => b - a);
}

async function retailGroup(code: string, year: number): Promise<RecoveryGroup | null> {
  const f = RETAIL_RECON_FIXTURES[code];
  const main = await loadRetailRecon(code, year);
  if (!main) return null;
  const g = retailLineRecoveries(main.pool, main.result, f.name, code);
  if (!f.mixedOfficeCode) return g;
  // A mixed centre: the office pot is its own recon on the same building.
  const off = await loadRetailRecon(f.mixedOfficeCode, year);
  if (!off) return g;
  const og = retailLineRecoveries(off.pool, off.result, `${f.name} (Office)`, f.mixedOfficeCode);
  const both = combineGroups([{ ...g, name: `${f.name} (Retail)` }, og], code, f.name)!;
  return both;
}

export async function loadRecoveries(key: string, year: number): Promise<RecoveryGroup | null> {
  const m = recoveryMembers(key);
  const groups: RecoveryGroup[] = [];
  for (const c of m.office) {
    const loaded = await loadOfficeRecon(c, year);
    if (loaded) groups.push(officeLineRecoveries(loaded.pool, loaded.result, loaded.finals, officeName(c)));
  }
  for (const c of m.retail) {
    const g = await retailGroup(c, year);
    if (g) groups.push(g);
  }
  if (!groups.length) return null;
  const name = RECOVERY_SCOPES.find((s) => s.key.toUpperCase() === key.toUpperCase())?.name ?? key;
  // One building (a mixed centre keeps its two pots as its buildings).
  if (groups.length === 1) return groups[0];
  return combineGroups(groups, key, name);
}
