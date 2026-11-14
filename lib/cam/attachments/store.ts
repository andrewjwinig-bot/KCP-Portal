// CAM backup attachments — the invoices/statements that support each property
// expense line (by GL account) for a given year. One record per file, scoped by
// property+year so a year's backup stays attached to that year's numbers
// permanently (audit trail). The files themselves live in blob (prod) or local
// FS (dev); this store holds the metadata manifest.

import "server-only";
import { scopedCollection } from "@/lib/collectionStore";

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
