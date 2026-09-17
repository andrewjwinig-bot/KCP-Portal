// Shared import-flow modal — types.
//
// One modal drives every batch file import: an uploading ("thinking") state and
// a completion report. Each entry point supplies a per-file (or batch) upload
// adapter + an optional report descriptor; the modal owns the UI + state
// machine only, so GL (multipart, per-file), AP (multipart, one request), and
// any future importer all share the same experience.

export type ImportFileStatus = "queued" | "reading" | "done" | "failed";

export type ImportFile = {
  filename: string;
  /** e.g. "4050 — Building 5" */
  entity?: string;
  /** secondary line under the entity, e.g. "through Dec" */
  detail?: string;
  /** right-side metric value + label, e.g. 74 "acct" */
  count?: number;
  countLabel?: string;
  status: ImportFileStatus;
  error?: string;
  /** small annotation under the entity (tie-out result, multi-year warning). */
  note?: string;
  noteTone?: "ok" | "warn";
  /** the endpoint's raw response, for report()/unlocks. */
  raw?: unknown;
};

/** What an upload adapter returns for one file (merged onto the queued row). */
export type ImportFileResult = Partial<ImportFile> & { status: ImportFileStatus };

export type ImportStat = { value: string; label: string };
export type ImportUnlock = { id: string; title: string; subtitle: string; href: string; cta?: string };
export type ImportAutoExplain = { run: () => Promise<void>; title?: string; subtitle?: string };
export type AutoExplainState = "none" | "running" | "done" | "dismissed";

export type ImportReport = {
  stats?: ImportStat[];
  /** Conditional downstream actions — render only what applies to this import. */
  unlocks?: ImportUnlock[];
  /**
   * The AI follow-up (violet). STARTS ON ITS OWN once the import lands.
   *
   * It used to ask first, and asking was the wrong default: the explanation is
   * most useful at the moment the numbers arrive, and the person who just
   * imported is the person who would have clicked yes. It is also cheap by
   * construction — it skips any line already carrying a note (manual or AI), so
   * a re-import costs nothing, and it now explains only the lines the statement
   * marks with a "?", which the variance floor keeps scarce.
   */
  autoExplain?: ImportAutoExplain | null;
};

export type ImportRequest = {
  kind: string;
  title: (n: number) => string;
  subtitle: string;
  files: File[] | FileList;
  by?: string;
  /** Per-file concurrency for the `upload` adapter (default 1 → top-down). */
  concurrency?: number;
  /** Per-file adapter. Provide EITHER `upload` OR `uploadAll`. */
  upload?: (file: File, ctx: { signal: AbortSignal }) => Promise<ImportFileResult>;
  /** Batch adapter — one request for all files, returns aligned per-file results. */
  uploadAll?: (files: File[], ctx: { signal: AbortSignal }) => Promise<{ files: ImportFileResult[]; raw?: unknown }>;
  /** Build the completion report from the finished rows (+ batch raw). */
  report?: (files: ImportFile[], raw: unknown) => ImportReport;
};

export type ImportState = "uploading" | "done" | "partial" | "error";

export type ImportRun = {
  kind: string;
  title: string;
  subtitle: string;
  by?: string;
  files: ImportFile[];
  state: ImportState;
  report: ImportReport | null;
  autoExplain: AutoExplainState;
  minimized: boolean;
};
