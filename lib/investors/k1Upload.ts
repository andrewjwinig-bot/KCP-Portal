// What can be dropped on an owner's row, checked before anything is sent.
//
// Pure, so the rules are testable and the wording is written once. The reason
// it exists at all: an upload that fails has to SAY why on the row it failed
// on. The card's error line sits above a roster that runs to twenty-four rows,
// so a failure further down was reported off-screen — the cell returned to
// MISSING and read as though the drop had never registered.

/** A route handler's request body is capped well below the 20 MB configured
 *  for server actions, and the platform refuses an oversized POST before any
 *  of our code runs — so the size is checked here, where the reason can be
 *  said, rather than read back from a bare status code. */
export const MAX_K1_MB = 4;
export const MAX_K1_BYTES = MAX_K1_MB * 1024 * 1024;

export type K1UploadCandidate = { name: string; size: number; type?: string };

/** The reason this file cannot be uploaded, or null when it can. */
export function k1UploadError(file: K1UploadCandidate | null | undefined): string | null {
  // A drop that carried no file. Dragging an attachment straight out of
  // Outlook hands the browser a promise of a file rather than the bytes, so
  // `dataTransfer.files` comes back empty — which used to do nothing at all.
  if (!file) {
    return "That drop didn’t carry a file. Some mail clients can’t drag an attachment straight in — save it to your desktop first, then drop it.";
  }
  const name = (file.name ?? "").trim();
  // By extension OR by type: a PDF exported from some scanners arrives without
  // an extension, and rejecting it on the name alone would be a technicality.
  if (!/\.pdf$/i.test(name) && file.type !== "application/pdf") {
    return `“${name || "That file"}” isn’t a PDF. K-1s must be PDFs.`;
  }
  if (file.size > MAX_K1_BYTES) {
    return `“${name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB. The upload limit is ${MAX_K1_MB} MB — a scanned K-1 usually drops below it if you re-save it as a reduced-size PDF.`;
  }
  if (file.size === 0) return `“${name}” is empty (0 bytes).`;
  return null;
}

/**
 * A filename trimmed for use inside a storage path, KEEPING its extension.
 *
 * Length is not a reason to refuse an upload and never has been — the full
 * name is recorded on the document and is what staff and investors see. This
 * only shortens the copy embedded in the storage key. Truncating naively took
 * the ".pdf" off the end of a long name, which left the stored object without
 * an extension for no benefit.
 */
export function storageName(name: string, max = 80): string {
  const safe = String(name).replace(/[^\w.\-]+/g, "_");
  if (safe.length <= max) return safe || "_";
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(safe);
  const ext = m ? m[0] : "";
  return (safe.slice(0, Math.max(1, max - ext.length)) + ext) || "_";
}
