import "server-only";
// ONE door for a Laser Statement file: Skyline's Excel export or the PDF
// Tanya saves (owner: "read PDFs so i dont need to rerun them as excel
// files"). Told apart by CONTENT ("%PDF"), not the file name.

import { parseSkylineStatements, type ParsedStatements } from "./parseSkylineStatements";
import { statementsFromLaserPages } from "./parseLaserPdf";
import { pdfPages } from "../pdf/pdfText";

export const isPdf = (buf: Buffer) => buf.subarray(0, 5).toString("latin1") === "%PDF-";

export async function parseStatementFile(buf: Buffer): Promise<ParsedStatements & { format: "pdf" | "excel" }> {
  if (!isPdf(buf)) return { ...parseSkylineStatements(buf), format: "excel" };
  let read;
  try { read = await pdfPages(buf); }
  catch { throw new Error("Could not read that PDF. Upload the Laser Statement PDF as Skyline saved it."); }
  // A PDF records when it was made only if the writer stamped it; Crystal's
  // Laser Statement does not, so "data through" falls back to the import.
  return { ...statementsFromLaserPages(read.pages), exportedAt: read.created, format: "pdf" };
}
