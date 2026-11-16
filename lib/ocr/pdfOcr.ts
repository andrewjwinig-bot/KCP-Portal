// Read a PDF with no readable text layer by OCR, IN THE BROWSER.
//
// A bank's accounts page printed through the Windows "Adobe PDF" printer
// (PScript5 + Acrobat Distiller) embeds its fonts as Type 3 with no character
// map: every text extractor — pdf.js here, pdf-parse on the server — gets
// control characters. There is no OCR binary on Vercel, so the page is rendered
// here with pdf.js (the build the website already serves from
// public/site/interplex/pdfjs) and read with tesseract.js, whose worker, wasm
// core and English model are SERVED FROM THE PORTAL (public/site/ocr — never a
// CDN). The recognised text goes to the import, which parses it with the same
// `parse.ts` (`{ ocr: true }`).
//
// The vendored files in public/site/ocr are copied from npm, never fetched:
// tesseract.js 7.0.0 `dist/tesseract.esm.min.js` + `dist/worker.min.js`,
// tesseract.js-core 7.0.0 `tesseract-core-simd-lstm.wasm.js` (one core, named
// outright, so the worker never asks for a variant that isn't there — every
// current Chrome / Edge / Firefox / Safari has wasm SIMD), and
// @tesseract.js-data/eng `4.0.0_best_int/eng.traineddata.gz`. Licences beside them.
//
// Browser-only: call it from a client component.

type PdfTextItem = { str?: string; hasEOL?: boolean };
type PdfPage = {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas?: HTMLCanvasElement }) => { promise: Promise<void> };
  cleanup?: () => void;
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<PdfDoc> };
};
type OcrWorker = { recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };
type TesseractLib = { createWorker: (lang: string, oem: number, opts: Record<string, unknown>) => Promise<OcrWorker> };

const OCR_BASE = "/site/ocr";
/** Pages are drawn at 3× (216 dpi): small print (Liberty's "x7216", Chase's
 *  "(...5615)") reads reliably; higher only slows it down. */
const SCALE = 3;
/** A bank's accounts page is a few pages; a 40-page file is not one. */
const MAX_PAGES = 12;

let pdfLib: Promise<PdfLib> | null = null;
function pdfjs(): Promise<PdfLib> {
  pdfLib ??= import(/* webpackIgnore: true */ "/site/interplex/pdfjs/pdf.min.mjs" as string).then((m: PdfLib) => {
    m.GlobalWorkerOptions.workerSrc = "/site/interplex/pdfjs/pdf.worker.min.mjs";
    return m;
  });
  return pdfLib;
}

let tessLib: Promise<TesseractLib> | null = null;
function tesseract(): Promise<TesseractLib> {
  tessLib ??= import(/* webpackIgnore: true */ `${OCR_BASE}/tesseract.esm.min.js` as string).then((m: { default?: TesseractLib } & TesseractLib) => m.default ?? m);
  return tessLib;
}

const abs = (p: string) => new URL(p, window.location.href).href;

async function openPdf(file: Blob): Promise<PdfDoc> {
  const lib = await pdfjs();
  return lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
}

/** The PDF's own text layer, as pdf.js reads it (what the server's import
 *  would get), to decide whether it needs OCR at all. */
export async function pdfTextLayer(file: Blob): Promise<string> {
  const doc = await openPdf(file);
  try {
    const out: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();
      out.push(items.map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : " ")).join(""));
      page.cleanup?.();
    }
    return out.join("\n");
  } finally {
    await doc.destroy().catch(() => {});
  }
}

/** OCR every page of each PDF; one tesseract worker for the batch. Returns the
 *  recognised text per file, pages joined top to bottom. */
export async function ocrPdfs(files: Blob[], onPage?: (fileIndex: number, page: number, pages: number) => void): Promise<string[]> {
  const T = await tesseract();
  const worker = await T.createWorker("eng", 1, {
    workerPath: abs(`${OCR_BASE}/worker.min.js`),
    corePath: abs(`${OCR_BASE}/tesseract-core-simd-lstm.wasm.js`),
    langPath: abs(OCR_BASE),
    workerBlobURL: false,
  });
  try {
    const texts: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const doc = await openPdf(files[i]);
      try {
        const pages: string[] = [];
        const count = Math.min(doc.numPages, MAX_PAGES);
        for (let n = 1; n <= count; n++) {
          onPage?.(i, n, count);
          const page = await doc.getPage(n);
          const viewport = page.getViewport({ scale: SCALE });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          const { data } = await worker.recognize(canvas);
          pages.push(data.text);
          canvas.width = canvas.height = 0;
          page.cleanup?.();
        }
        texts.push(pages.join("\n"));
      } finally {
        await doc.destroy().catch(() => {});
      }
    }
    return texts;
  } finally {
    await worker.terminate().catch(() => {});
  }
}
