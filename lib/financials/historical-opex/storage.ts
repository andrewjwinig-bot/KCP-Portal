// Storage for the Historical Operating Expenses dataset. Mirrors the
// budgets manifest pattern: one stored JSON blob holds the list of
// HistoricalOpExEntry rows, seeded from the bundled JSON file on first
// read. Once seeded the flag sticks, so staff can wipe entries without
// the seed coming back.

import "server-only";
import fs from "fs/promises";
import path from "path";
import { getJSON, storeJSON } from "@/lib/storage";
import type { HistoricalOpExEntry, HistoricalOpExStore } from "./types";

const PREFIX = "financials-historical-opex";
const MANIFEST_ID = "manifest";
const SEED_FILE = path.join(process.cwd(), "data", "historical-opex", "seed.json");

async function loadFromDisk(): Promise<HistoricalOpExEntry[]> {
  try {
    const buf = await fs.readFile(SEED_FILE, "utf8");
    const parsed = JSON.parse(buf) as { entries?: Partial<HistoricalOpExEntry>[] };
    const now = new Date().toISOString();
    return (parsed.entries ?? [])
      .filter((e) => e.propertyCode && e.lineLabel && e.yearly)
      .map((e) => ({
        propertyCode: String(e.propertyCode).toUpperCase(),
        lineLabel: String(e.lineLabel),
        glAccount: e.glAccount ? String(e.glAccount) : undefined,
        yearly: e.yearly as Record<string, number>,
        source: e.source ? String(e.source) : undefined,
        updatedAt: e.updatedAt ?? now,
      }));
  } catch {
    return [];
  }
}

async function loadStore(): Promise<HistoricalOpExEntry[]> {
  const stored = (await getJSON(PREFIX, MANIFEST_ID)) as HistoricalOpExStore | null;
  if (stored?.entries?.length) return stored.entries;
  if (stored?.seeded) return stored.entries ?? [];
  const seed = await loadFromDisk();
  await saveStore(seed, true);
  return seed;
}

async function saveStore(entries: HistoricalOpExEntry[], seeded = true): Promise<void> {
  await storeJSON(PREFIX, MANIFEST_ID, {
    entries,
    seeded,
    updatedAt: new Date().toISOString(),
  });
}

export async function listHistoricalOpEx(): Promise<HistoricalOpExEntry[]> {
  const all = await loadStore();
  return [...all].sort(
    (a, b) =>
      a.propertyCode.localeCompare(b.propertyCode) ||
      a.lineLabel.localeCompare(b.lineLabel),
  );
}

export async function getHistoricalOpEx(
  propertyCode: string,
  lineLabel: string,
): Promise<HistoricalOpExEntry | null> {
  const all = await loadStore();
  const pc = propertyCode.toUpperCase();
  return all.find((e) => e.propertyCode === pc && e.lineLabel.toLowerCase() === lineLabel.toLowerCase()) ?? null;
}

export async function upsertHistoricalOpEx(entry: HistoricalOpExEntry): Promise<void> {
  const all = await loadStore();
  const pc = entry.propertyCode.toUpperCase();
  const idx = all.findIndex(
    (e) => e.propertyCode === pc && e.lineLabel.toLowerCase() === entry.lineLabel.toLowerCase(),
  );
  const next = { ...entry, propertyCode: pc, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  await saveStore(all);
}

export async function deleteHistoricalOpEx(propertyCode: string, lineLabel: string): Promise<boolean> {
  const all = await loadStore();
  const pc = propertyCode.toUpperCase();
  const next = all.filter(
    (e) => !(e.propertyCode === pc && e.lineLabel.toLowerCase() === lineLabel.toLowerCase()),
  );
  if (next.length === all.length) return false;
  await saveStore(next);
  return true;
}
