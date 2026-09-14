import { describe, it, expect } from "vitest";
import { k1UploadError, storageName, MAX_K1_BYTES, MAX_K1_MB } from "./k1Upload";

const f = (name: string, size = 1024, type = "application/pdf") => ({ name, size, type });

describe("what can be dropped on an owner's row", () => {
  it("accepts an ordinary K-1", () => {
    expect(k1UploadError(f("2025 Parkwood SC K1P V1 FINAL SIGNED.pdf"))).toBeNull();
  });

  it("names the empty drop instead of doing nothing", () => {
    // The silent case. Dragging an attachment out of Outlook hands the browser
    // a promise of a file rather than the bytes, so nothing arrives — and the
    // row just stayed MISSING, which reads as the app ignoring you.
    expect(k1UploadError(null)).toMatch(/didn’t carry a file/i);
    expect(k1UploadError(undefined)).toMatch(/save it to your desktop/i);
  });

  it("does not care how long the name is", () => {
    // Worth pinning, because the length is the obvious thing to suspect when
    // "the long ones fail". It has never been a reason to refuse an upload.
    const long = "2025 " + "Neshaminy Interplex Building Four Partnership ".repeat(6) + "FINAL SIGNED.pdf";
    expect(long.length).toBeGreaterThan(250);
    expect(k1UploadError(f(long))).toBeNull();
  });

  it("takes a PDF by its type when the name has no extension", () => {
    // Some scanners export without one; refusing that is a technicality.
    expect(k1UploadError(f("scan0142", 2048, "application/pdf"))).toBeNull();
    expect(k1UploadError(f("K1.PDF", 2048, ""))).toBeNull();
    expect(k1UploadError(f("K1.pdf ", 2048, ""))).toBeNull(); // trailing space
  });

  it("refuses what isn't a PDF", () => {
    expect(k1UploadError(f("k1.xlsx", 2048, "application/vnd.ms-excel"))).toMatch(/isn’t a PDF/i);
  });

  it("says the size in MB, and what to do about it", () => {
    // The likeliest real cause of "some files won't upload": a scanned, signed
    // K-1 is megabytes where a generated one is kilobytes. The platform
    // refuses the body before the route runs, so this is the only place the
    // reason can be said.
    const msg = k1UploadError(f("big.pdf", MAX_K1_BYTES + 1))!;
    expect(msg).toMatch(new RegExp(`limit is ${MAX_K1_MB} MB`));
    expect(msg).toMatch(/reduced-size PDF/);
    expect(k1UploadError(f("ok.pdf", MAX_K1_BYTES))).toBeNull();
  });

  it("catches a zero-byte file", () => {
    expect(k1UploadError(f("empty.pdf", 0))).toMatch(/empty/i);
  });
});

describe("storageName", () => {
  it("keeps the extension when it shortens a long name", () => {
    // Truncating naively took the ".pdf" off the end and left the stored object
    // without one, for no benefit.
    const out = storageName("A".repeat(200) + ".pdf");
    expect(out).toHaveLength(80);
    expect(out.endsWith(".pdf")).toBe(true);
  });

  it("leaves a short name alone apart from unsafe characters", () => {
    expect(storageName("2025 Korman K-1 (final).pdf")).toBe("2025_Korman_K-1_final_.pdf");
  });

  it("never returns an empty key", () => {
    expect(storageName("///")).toBe("_");
    expect(storageName("")).toBe("_");
  });
});
