// Reads Skyline's Aging Report (Detailed) from either form it comes in: the
// Excel export (`parseAgingReport`) or the printed PDF Tanya circulates for the
// U&O delinquent review (`parseAgingPdf`). Told apart by CONTENT, never the
// file name.
import "server-only";
import { pdfPages } from "@/lib/pdf/pdfText";
import { parseAgingReport, type ParsedAging } from "./parseAgingReport";
import { agingFromPdfPages, looksLikeTenantAging } from "./parseAgingPdf";

const isPdf = (buf: Buffer) => buf.subarray(0, 4).toString() === "%PDF";

export async function parseAgingFile(buf: Buffer): Promise<ParsedAging> {
  if (!isPdf(buf)) return parseAgingReport(buf);
  const { pages } = await pdfPages(buf);
  return agingFromPdfPages(pages);
}

/** Is this file — PDF or Excel — the tenant Aging Report (Detailed)? */
export async function isTenantAgingFile(buf: Buffer): Promise<boolean> {
  try {
    if (!isPdf(buf)) { parseAgingReport(buf); return true; }
    const { pages } = await pdfPages(buf);
    return looksLikeTenantAging(pages);
  } catch { return false; }
}
