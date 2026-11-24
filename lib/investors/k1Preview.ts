// A fabricated investor portal, so staff can see exactly what an investor sees
// without sending anyone anything.
//
// Testing by emailing yourself works, but it has real consequences: it
// publishes a K-1, mints a live link, and marks that owner distributed on the
// tax tracker. This has none — no document is published, no link exists, and
// nothing is recorded. Everything below is invented.

export const PREVIEW_TOKEN = "preview";

/** A minimal valid one-page PDF, so the Download button behaves like the real
 *  one rather than 404ing mid-demo. */
export function previewPdf(): Buffer {
  const text = "SAMPLE - not a real Schedule K-1";
  const content = `BT /F1 16 Tf 62 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

/** A real owner's page as THEY would see it, for staff to check before sending.
 *  Shows their actual documents whether or not they've been sent — the point is
 *  to look before anything is released. Mints nothing, publishes nothing,
 *  records nothing. Safe because the caller is already `canManageK1` and can
 *  download these same PDFs from the roster. */
export function previewOwnerPayload(opts: {
  ownerName: string;
  propertyCode: string;
  propertyName: string;
  documents: {
    id: string; taxYear: number; filename: string; size: number;
    publishedAt: string | null; heldAs: string | null;
    propertyCode: string; propertyName: string;
  }[];
  /** How many partnerships this person's one link spans. */
  propertyCount: number;
  anyUnsent: boolean;
}) {
  return {
    ok: true as const,
    preview: true as const,
    previewOwner: opts.ownerName,
    previewUnsent: opts.anyUnsent,
    owner: { name: opts.ownerName, heldAs: null as string | null },
    property: { code: opts.propertyCode, name: opts.propertyName },
    propertyCount: opts.propertyCount,
    documents: opts.documents.sort((a, b) => b.taxYear - a.taxYear
      || a.propertyCode.localeCompare(b.propertyCode)
      || (a.heldAs ?? "").localeCompare(b.heldAs ?? "")),
  };
}

/** The payload the portal renders in preview. Two documents on purpose: that's
 *  the case worth seeing, where one person's trust interest and personal
 *  interest arrive on the same link and only the label tells them apart. */
export function previewPayload(year = new Date().getFullYear() - 1) {
  return {
    ok: true as const,
    preview: true as const,
    owner: { name: "Sample Investor", heldAs: null as string | null },
    property: { code: "7010", name: "Parkwood Shopping/Office Center" },
    propertyCount: 2,
    documents: [
      {
        id: "preview-trust", taxYear: year, filename: `${year} Schedule K-1 (sample).pdf`,
        size: 148_000, publishedAt: new Date().toISOString(),
        heldAs: "SAMPLE GST TR FBO Sample Investor",
        propertyCode: "7010", propertyName: "Parkwood Shopping/Office Center",
      },
      {
        id: "preview-personal", taxYear: year, filename: `${year} Schedule K-1 (sample).pdf`,
        size: 146_500, publishedAt: new Date().toISOString(),
        heldAs: null as string | null,
        propertyCode: "7010", propertyName: "Parkwood Shopping/Office Center",
      },
      {
        // A second partnership, because one link now covers every one they hold.
        id: "preview-other", taxYear: year, filename: `${year} Schedule K-1 (sample).pdf`,
        size: 151_200, publishedAt: new Date().toISOString(),
        heldAs: null as string | null,
        propertyCode: "7200", propertyName: "Elbridge Partnership",
      },
    ],
  };
}
