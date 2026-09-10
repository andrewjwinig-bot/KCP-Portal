// K-1 delivery — the documents a partnership hands its investors.
//
// There is deliberately no filename parsing here. A K-1 sent to the wrong
// investor discloses someone's taxpayer ID, income allocation and capital
// account, and a filename is weak evidence of who a document belongs to:
// Parkwood (7010) has 21 owner records and six of them share a name with
// another record — Alison Korman Feldman holds both a GST trust interest and a
// personal one. So a K-1 is uploaded ONTO an owner: you pick the row, drop the
// PDF, and the act of choosing the row is the assignment. Nothing infers it.

export type K1Document = {
  id: string;
  /** Property whose partnership issued it, e.g. "7010". */
  propertyCode: string;
  taxYear: number;
  filename: string;
  size: number;
  /** Private storage pointer — never a public URL. */
  ref: string;
  local: boolean;
  uploadedAt: string;
  uploadedBy: string | null;
  /** The owner record it was uploaded onto — chosen by a person, never derived. */
  ownerId: string;
  ownerName: string;
  /** Visible to the investor. */
  published: boolean;
  publishedAt: string | null;
  /** Access trail — a K-1 is worth knowing the reads of. */
  views: { at: string; ip?: string }[];
  viewCount: number;
  lastViewedAt: string | null;
};

/**
 * The publish gate. Uploading onto an owner row means every document already
 * names a recipient, so this is the last check rather than the only one: no
 * owner may hold two K-1s for the same year, and none may have lost its owner.
 * Either would mean somebody is about to receive a document that isn't theirs.
 */
export function publishBlockers(docs: K1Document[]): string[] {
  const out: string[] = [];
  const orphans = docs.filter((d) => !d.ownerId);
  if (orphans.length) {
    out.push(`${orphans.length} ${orphans.length === 1 ? "file is" : "files are"} not attached to an owner.`);
  }
  const byOwner = new Map<string, number>();
  for (const d of docs) if (d.ownerId) byOwner.set(d.ownerId, (byOwner.get(d.ownerId) ?? 0) + 1);
  for (const [ownerId, n] of [...byOwner.entries()].filter(([, n]) => n > 1)) {
    const name = docs.find((d) => d.ownerId === ownerId)?.ownerName ?? ownerId;
    out.push(`${name} has ${n} K-1s for this year — only one can be right.`);
  }
  return out;
}
