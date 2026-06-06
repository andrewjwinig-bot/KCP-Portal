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

export async function getMapping(key: string): Promise<StatementMapping | null> {
  const all = await loadMappings();
  return all[key] ?? null;
}

/** Dropdown list of every property/fund that has a statement mapping. */
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
