"use client";

// Open an import's file picker IN THE FOLDER IT WAS LAST USED FROM (owner,
// 11/2026: "so it opens to the right folder each time"). A website cannot
// name a folder path for the picker — the browser forbids it — but Chrome and
// Edge's File System Access picker remembers the last folder PER `id`, so each
// import gets its own memory: Import Laser Statement reopens in the Laser
// Statements folder, Import GL in the GL folder.
//
// It feeds the picked files back through the page's own hidden <input>, so
// each page's onChange handler runs exactly as before. Browsers without the
// API (Firefox, Safari) get the input's ordinary picker.

type PickerWindow = Window & {
  showOpenFilePicker?: (opts: {
    id?: string;
    multiple?: boolean;
    startIn?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption?: boolean;
  }) => Promise<{ getFile: () => Promise<File> }[]>;
};

/** Picker ids: up to 32 of [A-Za-z0-9_-]. */
export function pickerId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 32);
}

/** The input's `accept` (".pdf,.xls") as picker types; none when it takes any file. */
export function acceptTypes(accept: string): { description: string; accept: Record<string, string[]> }[] | undefined {
  const exts = accept.split(",").map((s) => s.trim().toLowerCase()).filter((s) => /^\.[a-z0-9]+$/.test(s));
  if (!exts.length) return undefined;
  return [{ description: exts.map((e) => e.slice(1).toUpperCase()).join(" / "), accept: { "application/octet-stream": exts } }];
}

/** Open `input`'s picker, remembering the folder under `id`. */
export async function pickInto(input: HTMLInputElement | null | undefined, id: string): Promise<void> {
  if (!input || input.disabled) return;
  const w = window as PickerWindow;
  // A folder picker (bank recs' "Choose folder") has no equivalent here.
  if (typeof w.showOpenFilePicker !== "function" || input.hasAttribute("webkitdirectory") || window.self !== window.top) {
    input.click();
    return;
  }
  let handles: { getFile: () => Promise<File> }[];
  try {
    handles = await w.showOpenFilePicker({
      id: pickerId(id),
      startIn: "documents",
      multiple: input.multiple,
      types: acceptTypes(input.accept || ""),
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return; // cancelled
    input.click(); // the picker is refused here — use the ordinary one
    return;
  }
  const files = await Promise.all(handles.map((h) => h.getFile()));
  if (!files.length) return;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
