import { describe, it, expect } from "vitest";
import { composeK1ShareEmail, applyK1EmailEdit } from "./k1ShareEmail";

const URL = "https://portal.kormancommercial.com/investor/tok123";
const base = { ownerName: "Lawrence Isard", propertyName: "Parkwood SC", taxYear: 2025, url: URL };

describe("composeK1ShareEmail", () => {
  it("names the partnership when there is one K-1", () => {
    const e = composeK1ShareEmail({ ...base, documentCount: 1 });
    expect(e.subject).toBe("Your 2025 Schedule K-1 — Parkwood SC");
    expect(e.body).toContain("Parkwood SC");
    expect(e.body).toContain(URL);
  });

  it("drops the partnership from the subject once the link opens several", () => {
    // One link covers every partnership, so naming one of them would be wrong.
    const e = composeK1ShareEmail({ ...base, documentCount: 3 });
    expect(e.subject).toBe("Your 2025 Schedule K-1s — Korman Commercial Properties");
    expect(e.body).toContain("Your 3 Schedule K-1s");
  });

  it("never puts the PIN in the email — only a note that it comes separately", () => {
    const e = composeK1ShareEmail({ ...base, documentCount: 1 });
    expect(e.body).toContain("separately");
    expect(e.body).not.toMatch(/\b\d{6}\b/);
  });
});

describe("applyK1EmailEdit", () => {
  const canonical = composeK1ShareEmail({ ...base, documentCount: 1 });

  it("uses the canonical draft when nothing was edited", () => {
    const r = applyK1EmailEdit(canonical, null, URL);
    expect(r.edited).toBe(false);
    expect(r.email).toEqual(canonical);
  });

  it("keeps the canonical half when only one field is edited", () => {
    const r = applyK1EmailEdit(canonical, { subject: "Your K-1 is ready" }, URL);
    expect(r.email.subject).toBe("Your K-1 is ready");
    expect(r.email.body).toBe(canonical.body);
    expect(r.edited).toBe(true);
  });

  it("restores the link an edit removed — the investor has no other way in", () => {
    const r = applyK1EmailEdit(canonical, { body: "Larry — your K-1 is up. Call me." }, URL);
    expect(r.email.body).toContain(URL);
    expect(r.email.body.startsWith("Larry")).toBe(true);
  });

  it("leaves an edited body alone when it already carries the link", () => {
    const body = `Hi Larry,\n\n${URL}\n\n— Drew`;
    expect(applyK1EmailEdit(canonical, { body }, URL).email.body).toBe(body);
  });

  it("ignores non-string edits rather than sending an empty email", () => {
    const r = applyK1EmailEdit(canonical, { subject: 42, body: { x: 1 } } as never, URL);
    expect(r.email).toEqual(canonical);
    expect(r.edited).toBe(false);
  });

  it("caps a runaway paste", () => {
    const r = applyK1EmailEdit(canonical, { body: "x".repeat(20000) }, URL);
    expect(r.email.body.length).toBeLessThanOrEqual(8000 + URL.length + 2);
  });
});
