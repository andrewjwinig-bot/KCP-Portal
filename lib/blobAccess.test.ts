import { describe, expect, it } from "vitest";
import { blobPathname, blobReaders, inlineSafe } from "./blobAccess";

const U = "https://abc123.private.blob.vercel-storage.com";

describe("blob proxy access (security audit 11/2026)", () => {
  it("takes only a full blob URL — never a bare pathname or another host", () => {
    expect(blobPathname("payroll/budget-payroll/2027.json")).toBeNull();
    expect(blobPathname("https://evil.example.com/maintenance/x.jpg")).toBeNull();
    expect(blobPathname("http://abc123.private.blob.vercel-storage.com/maintenance/x.jpg")).toBeNull();
    expect(blobPathname(`${U}/maintenance/r1/photo-abc.jpg`)).toBe("maintenance/r1/photo-abc.jpg");
  });
  it("never serves the JSON documents, K-1s or bank-rec files", () => {
    for (const p of ["payroll/user-passwords/drew.json", "payroll/budget-payroll/2027.json", "investor-k1/2025/x.pdf", "bank-rec-files/2026-10/a.pdf", "rentroll-history/2026-10.json"]) {
      expect(blobReaders(p)).toBeUndefined();
    }
    expect(blobReaders("maintenance/../payroll/x.json")).toBeUndefined();
  });
  it("gates the sensitive upload folders to their page", () => {
    expect(blobReaders("maintenance/r1/a.jpg")).toBeNull();
    expect(blobReaders("deposits/d1/check.jpg")).toEqual(["/deposits"]);
    expect(blobReaders("backups/snapshots/2026-11-23/part-1.zip")).toEqual(["/backups"]);
  });
  it("shows only PDFs and raster images inline", () => {
    expect(inlineSafe("application/pdf")).toBe(true);
    expect(inlineSafe("image/jpeg")).toBe(true);
    expect(inlineSafe("image/svg+xml")).toBe(false);
    expect(inlineSafe("text/html; charset=utf-8")).toBe(false);
    expect(inlineSafe("")).toBe(false);
  });
});
