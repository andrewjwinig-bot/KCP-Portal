"use client";

// Shared import-flow provider. Mount once (in the app shell). Any entry point
// calls `useImport().startImport(req)` to open the modal in its uploading state
// and drive it to the completion report. Owns the state machine + AbortController;
// the visual states live in ImportModal.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ImportFile, ImportFileResult, ImportRequest, ImportRun } from "./types";
import { ImportModal } from "./ImportModal";

type ImportContextValue = { startImport: (req: ImportRequest) => Promise<ImportRun> };
const ImportContext = createContext<ImportContextValue | null>(null);

export function useImport(): ImportContextValue {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error("useImport must be used within <ImportProvider>");
  return ctx;
}

export function ImportProvider({ children }: { children: React.ReactNode }) {
  const [run, setRun] = useState<ImportRun | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const patch = (i: number, res: Partial<ImportFile>) =>
    setRun((r) => (r ? { ...r, files: r.files.map((f, idx) => (idx === i ? { ...f, ...res } : f)) } : r));

  const startImport = useCallback(async (req: ImportRequest): Promise<ImportRun> => {
    const files = Array.from(req.files);
    const ac = new AbortController();
    abortRef.current = ac;

    const rows: ImportFile[] = files.map((f) => ({ filename: f.name, status: "queued" }));
    setRun({
      kind: req.kind,
      title: req.title(files.length),
      subtitle: req.subtitle,
      by: req.by,
      files: rows.map((r) => ({ ...r })),
      state: "uploading",
      report: null,
      autoExplain: "none",
      minimized: false,
    });

    const apply = (i: number, res: ImportFileResult) => { rows[i] = { ...rows[i], ...res }; patch(i, res); };
    let raw: unknown;

    if (req.uploadAll) {
      // Batch endpoint: all files upload in one request; show them reading, then
      // apply the aligned per-file results (or mark the batch failed).
      rows.forEach((_, i) => apply(i, { status: "reading" }));
      try {
        const out = await req.uploadAll(files, { signal: ac.signal });
        raw = out.raw;
        rows.forEach((_, i) => apply(i, out.files[i] ?? { status: "done" }));
      } catch (e) {
        const error = e instanceof Error ? e.message : "Upload failed";
        rows.forEach((_, i) => apply(i, { status: "failed", error }));
      }
    } else if (req.upload) {
      const concurrency = Math.max(1, req.concurrency ?? 1);
      let next = 0;
      const worker = async () => {
        for (;;) {
          const i = next++;
          if (i >= files.length || ac.signal.aborted) break;
          apply(i, { status: "reading" });
          try {
            apply(i, await req.upload!(files[i], { signal: ac.signal }));
          } catch (e) {
            apply(i, { status: "failed", error: e instanceof Error ? e.message : "Failed" });
          }
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
    }

    const done = rows.filter((f) => f.status === "done").length;
    const failed = rows.filter((f) => f.status === "failed").length;
    const state: ImportRun["state"] = failed === 0 ? "done" : done === 0 ? "error" : "partial";
    const report = req.report ? req.report(rows, raw) : null;
    const finalRun: ImportRun = {
      kind: req.kind,
      title: req.title(files.length),
      subtitle: req.subtitle,
      by: req.by,
      files: rows.map((r) => ({ ...r })),
      state,
      report,
      autoExplain: report?.autoExplain ? "prompt" : "none",
      minimized: false,
    };
    setRun((prev) => (prev ? finalRun : prev)); // don't reopen if cancelled/closed
    return finalRun;
  }, []);

  const close = useCallback(() => { abortRef.current?.abort(); setRun(null); }, []);
  const minimize = useCallback(() => setRun((r) => (r ? { ...r, minimized: true } : r)), []);
  const restore = useCallback(() => setRun((r) => (r ? { ...r, minimized: false } : r)), []);
  const dismissAutoExplain = useCallback(() => setRun((r) => (r ? { ...r, autoExplain: "dismissed" } : r)), []);
  const acceptAutoExplain = useCallback(async () => {
    let fn: (() => Promise<void>) | undefined;
    setRun((r) => { fn = r?.report?.autoExplain?.run; return r ? { ...r, autoExplain: "running" } : r; });
    try { await fn?.(); } catch { /* surfaced elsewhere */ }
    setRun((r) => (r ? { ...r, autoExplain: "done" } : r));
  }, []);

  const value = useMemo(() => ({ startImport }), [startImport]);
  return (
    <ImportContext.Provider value={value}>
      {children}
      {run && (
        <ImportModal
          run={run}
          onClose={close}
          onCancel={close}
          onMinimize={minimize}
          onRestore={restore}
          onAcceptAutoExplain={acceptAutoExplain}
          onDismissAutoExplain={dismissAutoExplain}
        />
      )}
    </ImportContext.Provider>
  );
}
