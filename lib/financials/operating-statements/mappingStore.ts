// Loads the per-property operating-statement line mappings (section ladder +
// account masks) extracted from the Skyline "All Properties Operating
// Statement" workbook. Read-only seed under data/operating-statements/; the
// statement compute resolves a property's mapping from here.
//
// Server-only — reads from the repo's data/ dir like the budget seeds do.

import "server-only";
import fs from "fs/promises";
import path from "path";
import type { StatementMapping } from "./types";
import { resolveKeyIn } from "./resolveKey";

const SEED_PATH = path.join(
  process.cwd(),
  "data",
  "operating-statements",
  "line-mappings.json"
);

let cache: Record<string, StatementMapping> | null = null;

/** All mappings keyed by the workbook sheet key (property code or fund code). */
export async function loadMappings(): Promise<Record<string, StatementMapping>> {
  if (cache) return cache;
  const raw = await fs.readFile(SEED_PATH, "utf-8");
  cache = JSON.parse(raw) as Record<string, StatementMapping>;
  return cache;
}

/** Resolve a GL header property code to its canonical mapping key, or null.
 *  (See resolveKeyIn — handles direct keys, propertyCode matches and fund-code
 *  aliases like FJVIII → PJV3.) */
export async function resolveStatementKey(code: string): Promise<string | null> {
  return resolveKeyIn(await loadMappings(), code);
}

export async function getMapping(key: string): Promise<StatementMapping | null> {
  const all = await loadMappings();
  const resolved = resolveKeyIn(all, key);
  return resolved ? all[resolved] ?? null : null;
}

/** Dropdown list of every property/fund that has a statement mapping. */
/**
 * Mappings kept for other pages but NOT run as monthly operating statements,
 * so nothing asks for their GL each month. Korman Homes (PHOMES) is a rollup
 * of the residential properties, which carry their own statements; the owner
 * does not import it monthly. Its mapping stays (Cash Analysis, Budgets and
 * the Skyline month-end consolidation still use PHOMES).
 */
export const NOT_IMPORTED_MONTHLY = new Set(["KORMAN HOMES"]);

/** The operating statements run each month: every mapping except the ones
 *  above. The statement picker, the "GL uploads behind" reminders, Flags to
 *  Investigate, the not-posted alerts and Reprojections all read this. */
export async function monthlyStatements(): Promise<{ key: string; propertyCode: string; entityName: string }[]> {
  return (await availableStatements()).filter((m) => !NOT_IMPORTED_MONTHLY.has(m.key));
}

export async function availableStatements(): Promise<
  { key: string; propertyCode: string; entityName: string }[]
> {
  const all = await loadMappings();
  return Object.entries(all).map(([key, m]) => ({
    key,
    propertyCode: m.propertyCode,
    entityName: m.entityName,
  }));
}
