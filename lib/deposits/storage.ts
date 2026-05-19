// Server-only storage for security deposits. Single-manifest pattern
// (same as reservations / suite information).

import "server-only";
import { getJSON, storeJSON } from "@/lib/storage";
import type { SecurityDeposit } from "./deposits";

const PREFIX = "security-deposits-manifest";
const ID = "all";

type Manifest = { deposits: SecurityDeposit[]; updatedAt: string };

export async function listDeposits(): Promise<SecurityDeposit[]> {
  const m = (await getJSON(PREFIX, ID)) as Manifest | null;
  return m && Array.isArray(m.deposits) ? m.deposits : [];
}

async function saveAll(deposits: SecurityDeposit[]): Promise<void> {
  await storeJSON(PREFIX, ID, { deposits, updatedAt: new Date().toISOString() });
}

export async function getDeposit(id: string): Promise<SecurityDeposit | null> {
  const all = await listDeposits();
  return all.find((d) => d.id === id) ?? null;
}

export async function saveDeposit(deposit: SecurityDeposit): Promise<SecurityDeposit> {
  const all = await listDeposits();
  const idx = all.findIndex((d) => d.id === deposit.id);
  if (idx >= 0) all[idx] = deposit;
  else all.push(deposit);
  await saveAll(all);
  return deposit;
}

export async function deleteDeposit(id: string): Promise<boolean> {
  const all = await listDeposits();
  const next = all.filter((d) => d.id !== id);
  if (next.length === all.length) return false;
  await saveAll(next);
  return true;
}
