// Append each charge's stored receipt to its invoice PDF (browser side). A PDF
// receipt's pages are copied in; a photo is drawn on its own letter page,
// scaled to fit. A format the browser cannot draw (HEIC on most browsers)
// gets a page naming the file, so the invoice never silently drops a receipt.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ChargeReceipt } from "./coding";

type WithReceipt = { id?: string; receipt?: ChargeReceipt | null; description?: string; amount?: number };

const LETTER: [number, number] = [612, 792];

async function toPng(blob: Blob): Promise<Uint8Array | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
    return out ? new Uint8Array(await out.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export async function appendReceipts(invoice: Blob, items: WithReceipt[]): Promise<Blob> {
  const seen = new Set<string>();
  const withR = items.filter((t) => t.id && t.receipt?.url && !seen.has(t.id) && (seen.add(t.id), true));
  if (!withR.length) return invoice;
  const out = await PDFDocument.load(await invoice.arrayBuffer());
  const font = await out.embedFont(StandardFonts.Helvetica);
  for (const t of withR) {
    const r = t.receipt!;
    let blob: Blob | null = null;
    try {
      const res = await fetch(`/api/expenses/receipt?id=${encodeURIComponent(t.id!)}`);
      if (res.ok) blob = await res.blob();
    } catch { /* falls to the note page */ }
    const type = (r.contentType || blob?.type || "").toLowerCase();
    try {
      if (blob && (type.includes("pdf") || r.name.toLowerCase().endsWith(".pdf"))) {
        const src = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
        for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
        continue;
      }
      if (blob && type.startsWith("image/")) {
        const bytes = type.includes("jpeg") || type.includes("jpg") ? new Uint8Array(await blob.arrayBuffer()) : await toPng(blob);
        if (bytes) {
          const img = type.includes("jpeg") || type.includes("jpg") ? await out.embedJpg(bytes) : await out.embedPng(bytes);
          const page = out.addPage(LETTER);
          const max = { w: LETTER[0] - 72, h: LETTER[1] - 96 };
          const k = Math.min(max.w / img.width, max.h / img.height, 1);
          const w = img.width * k, h = img.height * k;
          page.drawText(`Receipt · ${t.description ?? ""}`.slice(0, 90), { x: 36, y: LETTER[1] - 36, size: 10, font, color: rgb(0.28, 0.33, 0.4) });
          page.drawImage(img, { x: (LETTER[0] - w) / 2, y: LETTER[1] - 60 - h, width: w, height: h });
          continue;
        }
      }
    } catch { /* falls to the note page */ }
    const page = out.addPage(LETTER);
    page.drawText(`Receipt on file in the portal: ${r.name}`.slice(0, 100), { x: 36, y: LETTER[1] - 60, size: 12, font });
    page.drawText(`${t.description ?? ""}`.slice(0, 100), { x: 36, y: LETTER[1] - 80, size: 10, font, color: rgb(0.28, 0.33, 0.4) });
  }
  return new Blob([await out.save()], { type: "application/pdf" });
}
