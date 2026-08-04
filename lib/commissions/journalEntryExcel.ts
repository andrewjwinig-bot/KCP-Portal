// Server-side builder for the commissions GL / Journal Entry .xlsx (the file
// staff import into the accounting system). Mirrors the page's downloadJournalEntry
// so the quarter-end cron can attach the same files it produces on-screen.

import * as XLSX from "xlsx";
import { PROPERTY_DEFS } from "@/lib/properties/data";
import { buildJournalEntryRows, quarterShortCode, parseQuarterLabel, type JEFund, type CommissionEntry } from "@/lib/commissions";

export const JE_FUNDS: JEFund[] = ["JV III", "NI LLC"];

/** Building codes belonging to a fund (real buildings only — JEs skip entity cards). */
export function fundBuildings(fund: JEFund): string[] {
  return PROPERTY_DEFS.filter((p) => p.fundGroup === fund && !p.entityKind).map((p) => p.id);
}

/** Build the GL/JE .xlsx for one fund + quarter. Returns null when the fund has
 *  no commissions that quarter. */
export function buildJournalEntryXlsx(opts: {
  entries: CommissionEntry[];
  fund: JEFund;
  parsed: NonNullable<ReturnType<typeof parseQuarterLabel>>;
  batchNumber: number;
  uniqueId: number;
}): { filename: string; buffer: Uint8Array } | null {
  const { entries, fund, parsed, batchNumber, uniqueId } = opts;
  const rows = buildJournalEntryRows({
    entries, fund, fundBuildings: fundBuildings(fund),
    quarter: parsed.quarter, year: parsed.year, periodEnd: parsed.periodEnd,
    batchNumber, uniqueId,
  });
  if (!rows) return null;
  const code = quarterShortCode(parsed.quarter, parsed.year);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${fund.replace(/ /g, "_")} ${code}`);
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Uint8Array;
  return { filename: `JE_${fund.replace(/ /g, "_")}_${code}.xlsx`, buffer };
}
