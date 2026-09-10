"use client";

import { useState, type DragEvent } from "react";

// Consistent drag-and-drop file handling across every import screen. Spread the
// returned `dropHandlers` onto the drop target and use `dragging` for the hover
// highlight; the callback fires with the first accepted dropped file. Pairs with
// the existing click-to-select file input so both paths behave the same way.
export function useFileDrop(
  onFiles: (files: File[]) => void,
  opts?: { disabled?: boolean; accept?: (f: File) => boolean },
) {
  const [dragging, setDragging] = useState(false);
  const dropHandlers = {
    onDragOver: (e: DragEvent) => { e.preventDefault(); if (!opts?.disabled) setDragging(true); },
    onDragEnter: (e: DragEvent) => { e.preventDefault(); if (!opts?.disabled) setDragging(true); },
    onDragLeave: (e: DragEvent) => { e.preventDefault(); setDragging(false); },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (opts?.disabled) return;
      const all = Array.from(e.dataTransfer?.files ?? []);
      const accepted = opts?.accept ? all.filter(opts.accept) : all;
      if (accepted.length) onFiles(accepted);
    },
  };
  return { dragging, dropHandlers };
}

/** Accept helper: match by file extension (case-insensitive), e.g.
 *  byExt([".xls", ".xlsx"]). Empty/undefined list accepts everything. */
export function byExt(exts: string[]) {
  const lower = exts.map((e) => e.toLowerCase());
  return (f: File) => lower.length === 0 || lower.some((e) => f.name.toLowerCase().endsWith(e));
}
