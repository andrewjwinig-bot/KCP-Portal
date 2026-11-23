"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { feedInput } from "./pickFiles";

// Drop a file ANYWHERE on a staff page and it goes to that page's import
// (owner: "allow user to drag and drop files on all pages instead of having to
// click import"). A page opts an import in by marking its hidden file input
// `data-import="<what it imports>"` — "Laser Statement", "Rent Roll" — so an
// attachment input (a receipt, a floor plan, a check image) never catches a
// stray drop. The files go through that input exactly as if they were picked
// (`feedInput`), so the page's own import runs unchanged. A drop target that
// handles the drop itself (a receipt box, a header drop zone) wins: the drop
// arrives here already handled and is left alone. Where a page has two imports
// that take the file (Receivables: Laser Statement and Credit Balance Report
// both read .xls), it asks which.

type Candidate = { input: HTMLInputElement; label: string };

function importInputs(): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  document.querySelectorAll<HTMLInputElement>('input[type="file"][data-import]').forEach((input) => {
    if (input.disabled || !input.isConnected) return;
    const label = input.dataset.import || "file";
    if (seen.has(label)) return; // the same import rendered twice reads as one
    seen.add(label);
    out.push({ input, label });
  });
  return out;
}

function accepts(input: HTMLInputElement, file: File): boolean {
  const list = (input.accept || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return list.some((a) =>
    a.startsWith(".") ? name.endsWith(a)
      : a.endsWith("/*") ? type.startsWith(a.slice(0, -1))
      : type === a);
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export default function PageDrop() {
  const [over, setOver] = useState<string[] | null>(null); // labels on offer while dragging
  const [choose, setChoose] = useState<{ files: File[]; options: Candidate[] } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearHide = () => { if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; } };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // Always stop the browser opening a dropped file in place of the page.
      e.preventDefault();
      const c = importInputs();
      if (e.dataTransfer) e.dataTransfer.dropEffect = c.length ? "copy" : "none";
      setOver(c.length ? c.map((x) => x.label) : null);
      clearHide();
      // dragleave fires on every child crossed; hide only once the drag stops.
      hideTimer.current = window.setTimeout(() => setOver(null), 180);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      clearHide();
      setOver(null);
      if (e.defaultPrevented) return; // a drop target on the page took it
      if (e.target instanceof HTMLInputElement && e.target.type === "file") return; // dropped on a file box itself
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (!files.length) return;
      const all = importInputs();
      if (!all.length) return;
      const fits = all.filter((c) => files.every((f) => accepts(c.input, f)));
      if (fits.length === 1) { feedInput(fits[0].input, files); return; }
      if (fits.length > 1) { setChoose({ files, options: fits }); return; }
      setNote(`${files.length === 1 ? files[0].name : `These ${files.length} files`} can't be imported here — this page takes the ${all.map((c) => c.label).join(" or ")}.`);
      window.setTimeout(() => setNote(null), 6000);
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => { window.removeEventListener("dragover", onOver); window.removeEventListener("drop", onDrop); clearHide(); };
  }, []);

  return (
    <>
      {over && (
        <div className="no-print" aria-hidden style={{
          position: "fixed", inset: 8, zIndex: 300, pointerEvents: "none",
          border: "2px dashed var(--brand)", borderRadius: 14,
          display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 32,
        }}>
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", boxShadow: "0 8px 30px rgba(2,6,23,0.15)" }}>
            <Upload size={20} strokeWidth={1.75} color="var(--brand)" aria-hidden />
            <span style={{ fontSize: 16, fontWeight: 700 }}>
              Drop to import {over.length === 1 ? `the ${over[0]}` : ""}
            </span>
          </div>
        </div>
      )}
      {note && (
        <div className="no-print" role="status" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 300 }}>
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", maxWidth: 560, boxShadow: "0 8px 30px rgba(2,6,23,0.15)" }}>
            <span style={{ fontSize: 15 }}>{note}</span>
            <button className="btn sm" aria-label="Close" onClick={() => setNote(null)}><X size={16} strokeWidth={1.75} /></button>
          </div>
        </div>
      )}
      {choose && (
        <div className="no-print" onClick={() => setChoose(null)} style={{ position: "fixed", inset: 0, zIndex: 310, backgroundColor: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose an import" style={{ width: 420, maxWidth: "100%", padding: 20 }}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Import {choose.files.length === 1 ? "this file" : `these ${choose.files.length} files`} as…</div>
            <div style={{ fontSize: "var(--fs-14)", color: "var(--muted)", marginBottom: 14, overflowWrap: "anywhere" }}>
              {choose.files.map((f) => f.name).join(", ")}
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {choose.options.map((c) => (
                <button key={c.label} className="btn import" onClick={() => { const { files } = choose; setChoose(null); feedInput(c.input, files); }}>
                  <Upload size={16} strokeWidth={1.75} aria-hidden />Import {c.label}
                </button>
              ))}
              <button className="btn" onClick={() => setChoose(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
