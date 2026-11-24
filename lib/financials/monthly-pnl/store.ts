// Server-only persistence for imported monthly P&L statements.
// One blob per (property, year, kind) so re-importing a workbook overwrites the
// matching statements and nothing else.

import "server-only";
import { getJSON, storeJSON, listJSON, deleteJSON } from "@/lib/storage";
import { MonthlyPnlStatement, PnlKind, pnlStatementId } from "./types";

const PREFIX = "financials-monthly-pnl";

export async function savePnlStatement(s: MonthlyPnlStatement): Promise<void> {
  await storeJSON(PREFIX, pnlStatementId(s.propertyCode, s.year, s.kind), s);
}

export async function getPnlStatement(propertyCode: string, year: number, kind: PnlKind): Promise<MonthlyPnlStatement | null> {
  return (await getJSON(PREFIX, pnlStatementId(propertyCode, year, kind))) as MonthlyPnlStatement | null;
}

export async function listPnlStatements(): Promise<MonthlyPnlStatement[]> {
  const all = (await listJSON(PREFIX)) as MonthlyPnlStatement[];
  return (all ?? []).filter((s) => s && s.propertyCode && s.year);
}

export async function deletePnlStatement(propertyCode: string, year: number, kind: PnlKind): Promise<boolean> {
  return deleteJSON(PREFIX, pnlStatementId(propertyCode, year, kind));
}
