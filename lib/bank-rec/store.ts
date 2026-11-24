// BANK REC storage — the HISTORY is kept (owner: "we will need to also store
// the history of bank recs so we can reference prior ones if needed").
//
//   bank-rec-files/<YYYY-MM>/…   every file read for the month, as parsed
//   bank-rec-report/<YYYY-MM>    Skyline's Checking Account Report for it
//   bank-rec-runs/<YYYY-MM>      the month's rec, every account — the record
//   bank-rec-resolutions/…       open items someone cleared by hand, with why
//
// A run is rewritten each time the month's files change, until it is SIGNED
// OFF — then it is frozen, and a later import cannot quietly change history.

import "server-only";
import { getJSON, storeJSON, listJSON, deleteJSON } from "@/lib/storage";
import type { BankStatement, CheckingReport, RecFileKind, SkylineRec } from "./monthFiles";
import type { BankItem } from "./statementItems";
import type { AccountRec, OpenItem } from "./engine";

export type StoredFile = {
  period: string;
  name: string;
  kind: RecFileKind;
  last4: string | null;
  /** Where the account came from — the file's own contents, or (fallback) its name. */
  matchedBy: "content" | "name" | null;
  uploadedAt: string;
  by: string | null;
  statement?: BankStatement;
  items?: BankItem[] | null;
  itemizeError?: string | null;
  rec?: SkylineRec;
  /** The start of the text, kept only when a file could not be read. */
  textHead?: string;
  error?: string;
};

export type GlCheck = {
  company: string;
  glKey: string;
  skyline: number;
  gl: number | null;
  difference: number | null;
  accounts: { key: string; amount: number }[];
  glAccounts: { code: string; name: string; balance: number }[];
  /** GL cash lines this month that no Skyline register line accounts for, and the reverse. */
  glOnly: { dateISO: string; ref: string; description: string; amount: number; code: string }[];
  skylineOnly: { dateISO: string; ref: string; description: string; amount: number; key: string }[];
  note?: string;
};

/** The portal's rec of an account against Marie's Skyline rec for the same
 *  month: the statement and check-book balances each of them used, and the
 *  open items only one of them lists. `agrees` is all four empty. */
export type MarieCompare = {
  agrees: boolean;
  statement: { marie: number | null; portal: number | null };
  checkBook: { marie: number | null; portal: number | null };
  onlyMarie: OpenItem[];
  onlyPortal: OpenItem[];
};

export type AccountRow = {
  last4: string;
  bank: string;
  name: string;
  skylineKey: string | null;
  files: { name: string; kind: RecFileKind }[];
  rec: AccountRec | null;
  /** "n/a" — an account Skyline does not keep (not managed by LIK). */
  na?: boolean;
  /** Marie's own Skyline rec for the month, when one is filed — shown beside ours. */
  skylineRec?: {
    inBalance: boolean; unreconciled: number; adjustedCheckBookBalance: number | null; file: string;
    /** The portal's month against Marie's — her rec is the answer key. */
    vs?: MarieCompare;
  } | null;
  /** Where this month's opening open items came from. */
  carriedFrom: "portal" | "skyline-rec" | "none";
};

export type MonthRun = {
  period: string;
  computedAt: string;
  by: string | null;
  reportAsOf: string | null;
  accounts: AccountRow[];
  gl: GlCheck[];
  /** Active Skyline checking accounts that are not on the tracker. */
  unmappedSkyline: { key: string; bankName: string; balance: number }[];
  /** Files that matched no account. */
  unmatchedFiles: { name: string; kind: RecFileKind; reason: string }[];
  signedOff?: { by: string | null; at: string } | null;
};

export type Resolution = { id: string; note: string; by: string | null; at: string };

const fileId = (f: Pick<StoredFile, "last4" | "kind" | "name">) =>
  f.last4 ? `${f.last4}-${f.kind}` : `name-${f.name.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 80)}`;

export async function saveFile(f: StoredFile): Promise<void> {
  await storeJSON(`bank-rec-files/${f.period}`, fileId(f), f as unknown as object);
}
export async function filesFor(period: string): Promise<StoredFile[]> {
  return ((await listJSON(`bank-rec-files/${period}`, { fresh: true })) as StoredFile[]).filter(Boolean);
}
export async function deleteFile(period: string, f: Pick<StoredFile, "last4" | "kind" | "name">): Promise<void> {
  await deleteJSON(`bank-rec-files/${period}`, fileId(f));
}

export async function saveReport(period: string, rep: CheckingReport & { name: string; uploadedAt: string; by: string | null }): Promise<void> {
  await storeJSON("bank-rec-report", period, rep as unknown as object);
}
export async function reportFor(period: string): Promise<(CheckingReport & { name: string; uploadedAt: string }) | null> {
  return (await getJSON("bank-rec-report", period)) as never;
}

export async function saveRun(run: MonthRun): Promise<void> {
  await storeJSON("bank-rec-runs", run.period, run as unknown as object);
}
export async function runFor(period: string): Promise<MonthRun | null> {
  return (await getJSON("bank-rec-runs", period)) as MonthRun | null;
}
export async function allRuns(): Promise<MonthRun[]> {
  return ((await listJSON("bank-rec-runs", { fresh: true })) as MonthRun[]).filter(Boolean).sort((a, b) => b.period.localeCompare(a.period));
}

export async function resolutions(): Promise<Resolution[]> {
  return ((await listJSON("bank-rec-resolutions", { fresh: true })) as Resolution[]).filter(Boolean);
}
export async function setResolution(r: Resolution | { id: string; clear: true }): Promise<void> {
  if ("clear" in r) await deleteJSON("bank-rec-resolutions", r.id.replace(/[^A-Za-z0-9-]/g, "_"));
  else await storeJSON("bank-rec-resolutions", r.id.replace(/[^A-Za-z0-9-]/g, "_"), r);
}

export type { OpenItem };
