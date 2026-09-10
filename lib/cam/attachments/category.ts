// Categorize a CAM expense line into the three backup buckets a tenant package
// is organized by: Real Estate Taxes, Insurance, Operating Expenses.

export type BackupCategory = "Real Estate Taxes" | "Insurance" | "Operating Expenses";

/** Bucket an expense line by its GL account + label. RET accounts (6410*) →
 *  taxes; anything labelled insurance → insurance; everything else → operating. */
export function backupCategory(account: string, label = ""): BackupCategory {
  const a = account.trim();
  if (/^6410/.test(a) || /\b(real estate tax|re tax|property tax)\b/i.test(label)) return "Real Estate Taxes";
  if (/insurance/i.test(label)) return "Insurance";
  return "Operating Expenses";
}

/** A safe folder/segment for a zip path. */
export function safeSegment(s: string): string {
  return (s || "").replace(/[\/\\:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "Unfiled";
}
