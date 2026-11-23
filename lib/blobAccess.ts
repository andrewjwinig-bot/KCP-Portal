// Which stored files the authenticated proxy (/api/blob) may serve, and to whom.
//
// Security audit 11/2026: the proxy passed any `?url=` to `get()`, which also
// takes a bare PATHNAME — and every JSON document lives at a fixed, guessable
// path (`payroll/<prefix>/<id>.json`), so any signed-in login could read the
// payroll budget, password hashes or link PINs by name, past every API gate.
// Now: only a full blob URL, only the UPLOAD folders below, each behind the
// page that owns it. Anything else (payroll/, investor-k1/, bank-rec-files/ …)
// is served by its own gated route or not at all.

/** null = any signed-in user; a list = any one of those pages. */
export const BLOB_FOLDERS: Record<string, string[] | null> = {
  "maintenance/": null,          // service-request photos and attachments
  "suites/": null,               // floor plans, unit attachments
  "centers/": null,              // centre photos / logos
  "property-tax-docs/": null,    // tax bills on the property page
  "cc-receipts/": null,          // receipts — cardholders code on the dashboard
  "cam-attachments/": ["/cam-recon"],
  "deposits/": ["/deposits"],
  "bank-transfers/": ["/bank-transfers"],
  "backups/": ["/backups"],
};

const BLOB_HOST = /\.blob\.vercel-storage\.com$/i;

/** The pathname of a full blob URL, or null when it is not one (a bare
 *  pathname, another host, a malformed URL). */
export function blobPathname(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !BLOB_HOST.test(u.hostname)) return null;
    return decodeURIComponent(u.pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
}

/** The pages that may read a stored file: `null` = any signed-in user,
 *  `undefined` = nobody through the proxy. */
export function blobReaders(pathname: string): string[] | null | undefined {
  if (pathname.includes("..")) return undefined;
  const folder = Object.keys(BLOB_FOLDERS).find((f) => pathname.startsWith(f));
  return folder ? BLOB_FOLDERS[folder] : undefined;
}

/** Types a browser may show inline. Anything else is sent as a download, so a
 *  stored .html or .svg can never run as the portal. */
export function inlineSafe(contentType: string): boolean {
  const t = contentType.toLowerCase().split(";")[0].trim();
  return t === "application/pdf" || (t.startsWith("image/") && t !== "image/svg+xml");
}
