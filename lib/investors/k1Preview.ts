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

/** The payload the portal renders in preview. Two documents on purpose: that's
 *  the case worth seeing, where one person's trust interest and personal
 *  interest arrive on the same link and only the label tells them apart. */
export function previewPayload(year = new Date().getFullYear() - 1) {
  return {
    ok: true as const,
    preview: true as const,
    owner: { name: "Sample Investor", heldAs: null as string | null },
    property: { code: "7010", name: "Parkwood Shopping/Office Center" },
    documents: [
      {
        id: "preview-trust", taxYear: year, filename: `${year} Schedule K-1 (sample).pdf`,
        size: 148_000, publishedAt: new Date().toISOString(),
        heldAs: "SAMPLE GST TR FBO Sample Investor",
      },
      {
        id: "preview-personal", taxYear: year, filename: `${year} Schedule K-1 (sample).pdf`,
        size: 146_500, publishedAt: new Date().toISOString(),
        heldAs: null as string | null,
      },
    ],
  };
}
