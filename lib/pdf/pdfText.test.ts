import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { jsPDF } from "jspdf";
import { pdfText } from "./pdfText";

describe("pdfText", () => {
  // Vercel has no @napi-rs/canvas, so pdfjs finds no DOMMatrix there — the
  // failure "DOMMatrix is not defined" that broke every PDF import.
  it("reads text with no DOMMatrix in the runtime", async () => {
    delete (globalThis as Record<string, unknown>).DOMMatrix;
    const doc = new jsPDF();
    doc.text("2300 Brookwood OP (...5615) $1,000.00 $1,100.75 Checking", 10, 20);
    const text = await pdfText(Buffer.from(doc.output("arraybuffer")));
    expect(text).toContain("(...5615)");
  });
});
