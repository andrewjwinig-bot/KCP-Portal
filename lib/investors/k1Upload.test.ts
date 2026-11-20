import { describe, it, expect } from "vitest";
import { k1UploadError, storageName, requestFilename, displayFilename, MAX_K1_BYTES, MAX_K1_MB } from "./k1Upload";

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

  it("does not REFUSE a long name — the request just stops carrying one", () => {
    // A long filename really was breaking uploads: three 0800 K-1s failed
    // repeatedly and went through the moment the names were shortened by hand.
    // The fix is not to reject them — it is requestFilename below, which keeps
    // a long name out of the request altogether.
    const long = "2025 " + "Neshaminy Interplex Building Four Partnership ".repeat(6) + "FINAL SIGNED.pdf";
    expect(long.length).toBeGreaterThan(250);
    expect(k1UploadError(f(long))).toBeNull();
    expect(requestFilename(long).length).toBeLessThanOrEqual(60);
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

describe("a long filename never reaches the request", () => {
  it("shortens the name the file is SENT under, keeping the extension", () => {
    const long = "2025 Bellmawr JV K-1 " + "TRUST U-I 7TH WILL OF MK FBO CATHERINE ALTMAN ".repeat(4) + "FINAL.pdf";
    const sent = requestFilename(long);
    expect(sent.length).toBeLessThanOrEqual(60);
    expect(sent.endsWith(".pdf")).toBe(true);
  });

  it("leaves an ordinary name alone apart from unsafe characters", () => {
    expect(requestFilename("2025 Korman K-1.pdf")).toBe("2025_Korman_K-1.pdf");
  });

  it("always produces something usable", () => {
    // A name that is entirely unsafe characters must still yield a filename.
    expect(requestFilename("///").endsWith(".pdf")).toBe(true);
    expect(requestFilename("").length).toBeGreaterThan(0);
  });

  it("keeps the REAL name for display, bounded so nothing downstream chokes", () => {
    // What staff read is the name the accountant gave it, not the short one
    // the bytes travelled under.
    const long = "A".repeat(400) + ".pdf";
    const shown = displayFilename(long);
    expect(shown.length).toBeLessThanOrEqual(180);
    expect(shown.endsWith(".pdf")).toBe(true);
    expect(shown).toContain("…");
    expect(displayFilename("2025 Parkwood SC K1P V1 FINAL SIGNED.pdf")).toBe("2025 Parkwood SC K1P V1 FINAL SIGNED.pdf");
  });
});
