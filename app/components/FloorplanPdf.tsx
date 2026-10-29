"use client";

import { useEffect, useRef, useState } from "react";
import { planRotation } from "@/lib/suites/floorplanTurn";

// A floor-plan PDF drawn the way the WEBSITE draws it: page one through the
// same pdf.js build (served from public/site/interplex/pdfjs) and the same
// orientation rule (`planRotation`), so what the unit page shows is what a
// prospect sees. `turn` is the turn chosen by hand; null → the rule.

type PdfLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: string) => { promise: Promise<PdfDoc> };
};
type PdfPage = {
  view: number[];
  rotate: number;
  getTextContent: () => Promise<{ items: { str?: string; transform: number[] }[] }>;
  getViewport: (o: { scale: number; rotation: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
};
type PdfDoc = { getPage: (n: number) => Promise<PdfPage> };

let lib: Promise<PdfLib> | null = null;
function pdfjs(): Promise<PdfLib> {
  lib ??= import(/* webpackIgnore: true */ "/site/interplex/pdfjs/pdf.min.mjs" as string).then((m: PdfLib) => {
    m.GlobalWorkerOptions.workerSrc = "/site/interplex/pdfjs/pdf.worker.min.mjs";
    return m;
  });
  return lib;
}

export default function FloorplanPdf({ src, turn, maxHeight = 420, onTurn }: {
  src: string; turn: number | null; maxHeight?: number;
  /** The turn drawn, relative to the page's own /Rotate — so a rotate control can step from it. */
  onTurn?: (turn: number) => void;
}) {
  const report = useRef(onTurn);
  report.current = onTurn;
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    (async () => {
      try {
        const doc = await (await pdfjs()).getDocument(src).promise;
        const page = await doc.getPage(1);
        let angles: { angle: number; weight: number }[] = [];
        if (turn == null) {
          const tc = await page.getTextContent().catch(() => ({ items: [] }));
          angles = tc.items.filter((t) => t.str?.trim()).map((t) => ({
            angle: (Math.atan2(t.transform[1], t.transform[0]) * 180) / Math.PI,
            weight: t.str!.trim().length,
          }));
        }
        const [x0, y0, x1, y1] = page.view;
        const rotation = planRotation({ width: x1 - x0, height: y1 - y0, rotate: page.rotate, angles, turn });
        report.current?.((((rotation - page.rotate) % 360) + 360) % 360);
        const base = page.getViewport({ scale: 1, rotation });
        const width = Math.max(box.current?.clientWidth ?? 600, 240);
        const scale = Math.min(width / base.width, maxHeight / base.height) * Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale, rotation });
        const cv = canvas.current;
        if (!alive || !cv) return;
        cv.width = Math.round(vp.width);
        cv.height = Math.round(vp.height);
        await page.render({ canvasContext: cv.getContext("2d")!, viewport: vp }).promise;
        if (alive) setState("ok");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => { alive = false; };
  }, [src, turn, maxHeight]);

  return (
    <div ref={box} style={{
      width: "100%", minHeight: state === "ok" ? 0 : 160, display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: 10, border: "1px solid var(--border)", background: "#fff", padding: 6, boxSizing: "border-box",
    }}>
      <canvas ref={canvas} style={{ display: state === "ok" ? "block" : "none", maxWidth: "100%", maxHeight, height: "auto", width: "auto" }} />
      {state !== "ok" && (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{state === "loading" ? "Drawing the floor plan…" : "Couldn't draw the PDF — open it above."}</span>
      )}
    </div>
  );
}
