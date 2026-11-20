// Imported AP Aged Trial Balances, one record per as-of date. A second import
// for the same date replaces the properties it carries and keeps the rest, so a
// single property re-run never wipes the PALL file.
import "server-only";
import { createMapStore } from "@/lib/collectionStore";
import type { ApInvoice } from "./apAging";

export interface StoredApSection { code: string; name?: string; total: number; invoices: ApInvoice[]; placedBy: string }
export interface StoredApAging {
  asOf: string;
  importedAt: string;
  by: string | null;
  file: string;
  portfolioTotal: number | null;
  sections: Record<string, StoredApSection>;
}

const store = createMapStore<StoredApAging>({ prefix: "workpaper-ap-aging" });

export async function getApAging(asOf: string): Promise<StoredApAging | null> {
  return store.get(asOf);
}

export async function listApAgings(): Promise<{ asOf: string; importedAt: string; by: string | null; file: string; properties: number }[]> {
  const all = await store.all();
  return Object.values(all)
    .map((a) => ({ asOf: a.asOf, importedAt: a.importedAt, by: a.by, file: a.file, properties: Object.keys(a.sections).length }))
    .sort((a, b) => b.asOf.localeCompare(a.asOf));
}

export async function saveApAging(rec: StoredApAging): Promise<StoredApAging> {
  const prior = await store.get(rec.asOf);
  const merged: StoredApAging = { ...rec, sections: { ...(prior?.sections ?? {}), ...rec.sections } };
  await store.set(rec.asOf, merged);
  return merged;
}
