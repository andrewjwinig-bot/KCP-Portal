// CAM backup attachments — the invoices/statements that support each property
// expense line (by GL account) for a given year. One record per file, scoped by
// property+year so a year's backup stays attached to that year's numbers
// permanently (audit trail). The files themselves live in blob (prod) or local
// FS (dev); this store holds the metadata manifest.

import "server-only";
import { scopedCollection } from "@/lib/collectionStore";
import { capexFor } from "@/lib/cam/retail/capex";

export type CamAttachment = {
  id: string;
  property: string;
  year: number;
  /** GL account the backup supports — the expense line's key. */
  account: string;
  /** The line's display label at upload time (for zip folders / display). */
  accountLabel: string;
  name: string;
  /** Blob URL or local file path — never sent to the client. */
  ref: string;
  /** True when stored on local FS (dev fallback). */
  local?: boolean;
  contentType: string;
  size: number;
  uploadedAt: string;
  uploadedBy?: string;
  /** Included in the tenant-shareable package / zip. Default true. */
  includeInPackage: boolean;
};

/** Client-safe view — never exposes the storage ref. */
export type CamAttachmentMeta = Omit<CamAttachment, "ref" | "local">;

export function toMeta(a: CamAttachment): CamAttachmentMeta {
  const { ref, local, ...meta } = a;
  return meta;
}

const scoped = scopedCollection<CamAttachment>({ prefix: "cam-attachments", keyOf: (a) => a.id });

/** The attachment collection for one property + year. */
export function camAttachments(property: string, year: number) {
  return scoped.forScope(`${property}-${year}`);
}

/** A property/year's backup PLUS the backup filed against an amortized
 *  capital project (capex.ts) in any earlier year of its term (owner: "can
 *  that attachment stay with that line item until its done … so i dont need
 *  to reattach it each year"). A carried file keeps its own `year`, so it is
 *  viewed, downloaded and deleted where it was filed. */
export async function attachmentsFor(property: string, year: number): Promise<CamAttachment[]> {
  const own = await camAttachments(property, year).all();
  const carried: CamAttachment[] = [];
  for (const c of capexFor(property)) {
    if (c.lastYear != null && year > c.lastYear) continue;
    const from = c.firstYear ?? year - 15;
    for (let y = from; y < year; y++) {
      const recs = await camAttachments(property, y).all().catch(() => [] as CamAttachment[]);
      carried.push(...recs.filter((a) => a.account === c.label));
    }
  }
  return [...own, ...carried];
}
