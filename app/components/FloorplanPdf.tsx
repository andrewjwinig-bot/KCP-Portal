"use client";

import { useEffect, useRef, useState } from "react";
import { cropAt, planRotation, type PlanCrop } from "@/lib/suites/floorplanTurn";

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
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; transform?: number[] }) => { promise: Promise<void> };
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

type Rect = { x: number; y: number; w: number; h: number };

export default function FloorplanPdf({ src, turn, crop, editing = false, maxHeight = 420, onTurn, onCrop }: {
  src: string; turn: number | null;
  /** The saved crop (`PlanCrop`); drawn only at the rotation it was chosen at. */
  crop?: unknown;
  /** Show the WHOLE sheet with the crop as a box to drag a new one. */
  editing?: boolean;
  maxHeight?: number;
  /** The turn drawn, relative to the page's own /Rotate — so a rotate control can step from it. */
  onTurn?: (turn: number) => void;
  /** A box dragged in editing mode, as a `PlanCrop`. */
  onCrop?: (crop: PlanCrop) => void;
}) {
  const report = useRef(onTurn);
  report.current = onTurn;
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [rotation, setRotation] = useState<number | null>(null);
  const [drag, setDrag] = useState<Rect | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cropKey = JSON.stringify(crop ?? null);

  useEffect(() => {
    let alive = true;
    setState("loading");
    setDrag(null);
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
        const rot = planRotation({ width: x1 - x0, height: y1 - y0, rotate: page.rotate, angles, turn });
        report.current?.((((rot - page.rotate) % 360) + 360) % 360);
        const c = editing ? null : cropAt(JSON.parse(cropKey), rot);
        const base = page.getViewport({ scale: 1, rotation: rot });
        const bw = base.width * (c ? c.w : 1), bh = base.height * (c ? c.h : 1);
        const width = Math.max(box.current?.clientWidth ?? 600, 240);
        const scale = Math.min(width / bw, maxHeight / bh) * Math.min(window.devicePixelRatio || 1, 2);
        const vp = page.getViewport({ scale, rotation: rot });
        const cv = canvas.current;
        if (!alive || !cv) return;
        cv.width = Math.round(vp.width * (c ? c.w : 1));
        cv.height = Math.round(vp.height * (c ? c.h : 1));
        await page.render({
          canvasContext: cv.getContext("2d")!, viewport: vp,
          ...(c ? { transform: [1, 0, 0, 1, -vp.width * c.x, -vp.height * c.y] } : {}),
        }).promise;
        if (alive) { setRotation(rot); setState("ok"); }
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => { alive = false; };
  }, [src, turn, maxHeight, editing, cropKey]);

  // Pointer → fraction of the drawn sheet.
  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const shown = editing ? (drag ?? (rotation != null ? cropAt(crop, rotation) : null)) : null;

  return (
    <div ref={box} style={{
      width: "100%", minHeight: state === "ok" ? 0 : 160, display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: 10, border: "1px solid var(--border)", background: "#fff", padding: 6, boxSizing: "border-box",
    }}>
      <div style={{ position: "relative", display: state === "ok" ? "inline-block" : "none", lineHeight: 0, overflow: "hidden" }}>
        <canvas ref={canvas} style={{ display: "block", maxWidth: "100%", maxHeight, height: "auto", width: "auto",
          cursor: editing ? "crosshair" : undefined, touchAction: editing ? "none" : undefined }}
          onPointerDown={editing ? (e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = at(e); setDrag({ ...start.current, w: 0, h: 0 }); } : undefined}
          onPointerMove={editing ? (e) => { if (!start.current) return; const p = at(e), s0 = start.current;
            setDrag({ x: Math.min(s0.x, p.x), y: Math.min(s0.y, p.y), w: Math.abs(p.x - s0.x), h: Math.abs(p.y - s0.y) }); } : undefined}
          onPointerUp={editing ? () => { start.current = null;
            if (drag && drag.w > 0.03 && drag.h > 0.03 && rotation != null) onCrop?.({ ...drag, rotation });
            else setDrag(null); } : undefined}
        />
        {shown && (
          <div style={{
            position: "absolute", left: `${shown.x * 100}%`, top: `${shown.y * 100}%`, width: `${shown.w * 100}%`, height: `${shown.h * 100}%`,
            border: "2px solid #0b4a7d", background: "rgba(11,74,125,0.08)", boxShadow: "0 0 0 9999px rgba(15,23,42,0.28)", pointerEvents: "none",
          }} />
        )}
      </div>
      {state !== "ok" && (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{state === "loading" ? "Drawing the floor plan…" : "Couldn't draw the PDF — open it above."}</span>
      )}
    </div>
  );
}
