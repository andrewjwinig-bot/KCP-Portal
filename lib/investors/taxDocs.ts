// Partnership-level tax documents — the rest of the return that arrives with
// the K-1 batch: the Client Copy, the Government Copy, Estimated Tax Vouchers,
// and the bound Partner K-1 Copy.
//
// These are NOT circulated to investors. They belong to the partnership, they
// carry every partner's allocation, and the Government Copy is the filed
// return. So they are deliberately a SEPARATE store from `investor-k1` with no
// `ownerId` on the record at all — the investor portal addresses documents by
// owner (`publishedK1sForOwner`, and a file route that re-checks
// `doc.ownerId === link.ownerId`), so a record with no owner cannot be reached
// by any token route even if one were pointed at the wrong collection. The
// separation is structural, not a flag someone could flip.

/** The four copies an accountant sends per partnership per year. */
export const TAX_DOC_KINDS = [
  { id: "client", label: "Client Copy", note: "The partnership's own copy of the return." },
  { id: "government", label: "Government Copy", note: "The copy as filed." },
  { id: "vouchers", label: "Estimated Tax Vouchers", note: "Next year's estimates." },
  { id: "partner-k1", label: "Partner K-1 Copy", note: "All partners' K-1s bound together — not for circulation." },
] as const;

export type TaxDocKind = (typeof TAX_DOC_KINDS)[number]["id"];

export function isTaxDocKind(v: unknown): v is TaxDocKind {
  return typeof v === "string" && TAX_DOC_KINDS.some((k) => k.id === v);
}

export function taxDocLabel(kind: TaxDocKind): string {
  return TAX_DOC_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

export type PropertyTaxDoc = {
  id: string;
  /** Partnership the return belongs to, e.g. "7010". */
  propertyCode: string;
  taxYear: number;
  kind: TaxDocKind;
  filename: string;
  size: number;
  /** Private storage pointer — never a public URL. */
  ref: string;
  local: boolean;
  uploadedAt: string;
  uploadedBy: string | null;
};
