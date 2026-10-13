// Text out of an uploaded PDF, on the server. ONE helper for every import that
// reads a PDF (bank balances, the AP Selection Report).
//
// pdf-parse's pdfjs core builds a `DOMMatrix` when it loads. In a browser that
// is native; on Node pdfjs borrows it from the optional native module
// `@napi-rs/canvas` — which Vercel does not trace into the function, so every
// import there died with "DOMMatrix is not defined" while working locally.
// Extracting TEXT never renders anything, so a minimal stand-in is enough:
// it is installed only when nothing better exists, and never replaces a real
// DOMMatrix.

import "server-only";

class MatrixStub {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  constructor(init?: number[]) {
    if (Array.isArray(init) && init.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init;
  }
  get m11() { return this.a; } get m12() { return this.b; } get m21() { return this.c; }
  get m22() { return this.d; } get m41() { return this.e; } get m42() { return this.f; }
  get is2D() { return true; }
  get isIdentity() { return this.a === 1 && !this.b && !this.c && this.d === 1 && !this.e && !this.f; }
  private copy() { return new MatrixStub([this.a, this.b, this.c, this.d, this.e, this.f]); }
  multiplySelf() { return this; } preMultiplySelf() { return this; } translateSelf() { return this; }
  scaleSelf() { return this; } invertSelf() { return this; }
  multiply() { return this.copy(); } translate() { return this.copy(); } scale() { return this.copy(); } inverse() { return this.copy(); }
}

function ensureDomMatrix() {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") g.DOMMatrix = MatrixStub;
}

export async function pdfText(data: Buffer | Uint8Array): Promise<string> {
  ensureDomMatrix();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy().catch(() => {});
  }
}
