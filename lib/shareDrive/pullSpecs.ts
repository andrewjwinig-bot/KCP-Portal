// WHERE EACH IMPORT LIVES ON THE SHARE DRIVE, and which file to take (owner,
// 11/2026: "apply these pull from the share drive for more reports on other
// pages"; "i can do NN for all reports"). Paths are from the top of the
// synced "KCP - Documents" folder; a report is saved with its MONTH NUMBER in
// front ("10 PALL.xls", "11 2026 RR.xls"), and the pull takes the highest.
//
// Pure: the browser side (`app/components/shareFolder.ts`) walks the folders.

export type ShareFile = { name: string; modified: number };

export type PullSpec = {
  /** What it pulls, for messages ("the General Ledger"). */
  what: string;
  /** The folder, from the top of KCP - Documents, for a year. */
  segments: (year: number) => string[];
  /** The folder holds a sub-folder per MONTH ("11 November"): the newest
   *  with files is read, at this path inside it. */
  monthFolders?: { inner: string[] };
  /** From the folder's files, the ones to import (empty = none yet). */
  pick: (files: ShareFile[]) => string[];
};

/** "10 PALL.xls" → 10; anything not led by a month number → null. */
export function monthPrefix(name: string): number | null {
  const m = name.match(/^(\d{1,2})[\s._-]/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? n : null;
}

/** For each kind the test sorts a name into, the file with the highest month
 *  number. A kind of null leaves the file out. */
export function newestByKind(names: string[], kindOf: (name: string) => string | null): string[] {
  const best = new Map<string, { name: string; m: number }>();
  for (const name of names) {
    const kind = kindOf(name);
    const m = monthPrefix(name);
    if (kind == null || m == null) continue;
    const cur = best.get(kind);
    if (!cur || m > cur.m) best.set(kind, { name, m });
  }
  return [...best.values()].map((b) => b.name);
}

const XLS = /\.xls[xm]?$/i;

/** The month's Detailed General Ledger: the newest PALL and PFUNDS exports.
 *  The single-property files in the same folder are from before PALL. */
export const GL_PULL: PullSpec = {
  what: "the General Ledger (PALL / PFUNDS)",
  segments: (y) => ["Data", "Accounting", `!${y} Year End`, "Reports to Eisner", "Monthly GLs"],
  pick: (files) => newestByKind(files.map((f) => f.name), (n) => (!XLS.test(n) ? null : /\bPALL\b/i.test(n) ? "pall" : /\bPFUNDS\b/i.test(n) ? "pfunds" : null)),
};

/** The month's rent roll: "NN YYYY RR.xls" in the year's folder. */
export const RENT_ROLL_PULL: PullSpec = {
  what: "the Rent Roll",
  segments: (y) => ["Data", "Shared", "Properties", "Monthly Rent Rolls", String(y)],
  pick: (files) => newestByKind(files.map((f) => f.name), (n) => (XLS.test(n) && /\bRR\b/i.test(n) ? "rr" : null)),
};

/** The file saved most recently, of those the test keeps. For a folder with
 *  no year in its path, where a month number alone would read January as
 *  older than December. */
export function newestSaved(files: ShareFile[], keep: (name: string) => boolean): string[] {
  const kept = files.filter((f) => keep(f.name)).sort((a, b) => b.modified - a.modified);
  return kept.length ? [kept[0].name] : [];
}

/** Skyline's Credit Balance report, run on the 15th: the newest saved in
 *  Monthly Reports\Credits (one folder, every year). */
export const CREDIT_BALANCE_PULL: PullSpec = {
  what: "the Credit Balance Report",
  segments: () => ["Data", "Shared", "Monthly Reports", "Credits"],
  pick: (files) => newestSaved(files, (n) => XLS.test(n) && !n.startsWith("~$")),
};

/** The newest month folder first: "11 November" before "9 September". */
export function monthFoldersNewestFirst(names: string[]): string[] {
  return names.filter((n) => monthPrefix(n + " ") != null).sort((a, b) => monthPrefix(b + " ")! - monthPrefix(a + " ")!);
}

/** Skyline's Laser Statement: every PDF in the newest month's Laser
 *  Statements folder — the building groups first, then a single tenant's
 *  re-run ("4500-3021.pdf"), which corrects that tenant only. The Excel export
 *  only where no PDF was saved. */
export const LASER_STATEMENT_PULL: PullSpec = {
  what: "the Laser Statements",
  segments: (y) => ["Data", "Shared", "Properties", "Billings and Statements", `${y} Billing and Statements`],
  monthFolders: { inner: ["Laser Statements"] },
  pick: (files) => {
    const usable = files.filter((f) => !f.name.startsWith("~$"));
    const pdfs = usable.filter((f) => /\.pdf$/i.test(f.name));
    const chosen = pdfs.length ? pdfs : usable.filter((f) => XLS.test(f.name));
    const single = (n: string) => /^[0-9A-Z]{4}[A-Z]?-[\w-]+\.(pdf|xlsx?)$/i.test(n);
    return [...chosen.filter((f) => !single(f.name)), ...chosen.filter((f) => single(f.name))].map((f) => f.name);
  },
};
