import { describe, expect, it } from "vitest";
import { backupHealth, easternDate, fileBackupPath, folderOf, folderSummary, isBackupPath, isJsonPath, snapshotsToKeep } from "./plan";

describe("backup plan", () => {
  it("never backs up its own copies", () => {
    expect(isBackupPath("backups/snapshots/2026-11-23/part-1.zip")).toBe(true);
    expect(isBackupPath("payroll/rentroll/current.json")).toBe(false);
  });
  it("zips JSON, copies files", () => {
    expect(isJsonPath("payroll/x/y.json")).toBe(true);
    expect(isJsonPath("investor-k1/2025/a.pdf")).toBe(false);
  });
  it("dates a run by Eastern time", () => {
    expect(easternDate(new Date("2026-11-24T04:30:00Z"))).toBe("2026-11-23");
    expect(easternDate(new Date("2026-11-24T06:00:00Z"))).toBe("2026-11-24");
  });
  it("keeps every version of a file", () => {
    expect(fileBackupPath("deposits/a.pdf", "2026-11-23T10:11:12.000Z")).toBe("backups/files/20261123101112/deposits/a.pdf");
  });
  it("keeps 30 nights plus the first of each month for a year", () => {
    const dates: string[] = [];
    for (let d = new Date("2025-06-01T12:00:00Z"); d <= new Date("2026-11-23T12:00:00Z"); d = new Date(d.getTime() + 864e5)) dates.push(d.toISOString().slice(0, 10));
    const keep = snapshotsToKeep(dates);
    expect(keep.has("2026-11-23")).toBe(true);
    expect(keep.has("2026-10-25")).toBe(true);
    expect(keep.has("2026-10-24")).toBe(false);
    expect(keep.has("2026-10-01")).toBe(true);
    expect(keep.has("2025-12-01")).toBe(true);
    expect(keep.has("2025-11-01")).toBe(false);
    expect(keep.size).toBe(30 + 11);
  });
  it("groups the manifest by folder", () => {
    expect(folderOf("payroll/rentroll-history/2026-10.json")).toBe("payroll/rentroll-history");
    expect(folderOf("deposits/abc/check.pdf")).toBe("deposits");
    const s = folderSummary([
      { pathname: "payroll/a/1.json", size: 10, uploadedAt: "", part: 1 },
      { pathname: "payroll/a/2.json", size: 5, uploadedAt: "", part: 1 },
      { pathname: "deposits/x.pdf", size: 100, uploadedAt: "", copy: "backups/files/1/deposits/x.pdf" },
    ]);
    expect(s).toEqual([
      { folder: "deposits", documents: 0, files: 1, bytes: 100 },
      { folder: "payroll/a", documents: 2, files: 0, bytes: 15 },
    ]);
  });
  it("calls a backup stale after 36 hours", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    expect(backupHealth("2026-11-23T07:00:00Z", now).ok).toBe(true);
    expect(backupHealth("2026-11-21T12:00:00Z", now).ok).toBe(false);
    expect(backupHealth(null, now).ok).toBe(false);
  });
});
