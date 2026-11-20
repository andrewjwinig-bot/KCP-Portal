// The U&O month record and the standing settings (server). One record per
// filing month (`uo-months/<YYYY-MM>`): who is reported delinquent and who
// confirmed it, each property's return as FILED (frozen — a later rent-roll
// import never moves a month already filed), and what was emailed when.

import "server-only";
import { getJSON, listJSON, storeJSON } from "@/lib/storage";
import type { UoLines } from "./compute";

const MONTHS = "uo-months";
const SETTINGS = "uo-settings";

export type UoFiled = {
  at: string;
  by: string;
  lines: UoLines;
  /** The 1% was taken (filed and paid by the 25th). */
  discountTaken: boolean;
  delinquents: string[];
};

export type UoMonth = {
  month: string;
  /** Unit refs reported delinquent this month (the UO3). */
  delinquents: string[];
  /** Set once Greg / Harry / Nancy have reviewed the list. */
  confirmedAt?: string;
  confirmedBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  /** Property code → its return as filed. */
  filed: Record<string, UoFiled>;
  /** Property code → take the discount (default yes). */
  skipDiscount?: string[];
  reviewEmailedAt?: string;
  reviewRemindedAt?: string;
  readyEmailedAt?: string;
  overdueEmailedAt?: string;
  taskTickedAt?: string;
};

export type UoSettings = {
  /** unitRef → why the City does not tax them (added by hand). */
  exempt: Record<string, string>;
  /** unitRefs a name rule or seed would exempt that are in fact taxed. */
  notExempt: string[];
  /** "<parcel>:<year>" → the assessed value the City's form shows, where it
   *  differs from the portal's (an appeal, a new certified value). */
  assessed: Record<string, number>;
  updatedAt?: string;
  updatedBy?: string;
};

export const emptyMonth = (month: string): UoMonth => ({ month, delinquents: [], filed: {} });

export async function getUoMonth(month: string): Promise<UoMonth | null> {
  const m = (await getJSON(MONTHS, month, { retryOnMiss: true })) as UoMonth | null;
  return m ? { ...emptyMonth(month), ...m } : null;
}
export async function saveUoMonth(m: UoMonth): Promise<void> {
  await storeJSON(MONTHS, m.month, m);
}
export async function listUoMonths(): Promise<UoMonth[]> {
  const all = (await listJSON(MONTHS, { fresh: true }).catch(() => [])) as UoMonth[];
  return all.filter((m) => m && /^\d{4}-\d{2}$/.test(m.month)).sort((a, b) => b.month.localeCompare(a.month));
}

export async function getUoSettings(): Promise<UoSettings> {
  const s = (await getJSON(SETTINGS, "current", { retryOnMiss: true })) as Partial<UoSettings> | null;
  return { exempt: {}, notExempt: [], assessed: {}, ...(s ?? {}) };
}
export async function saveUoSettings(s: UoSettings): Promise<void> {
  await storeJSON(SETTINGS, "current", s);
}
