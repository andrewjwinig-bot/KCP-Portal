import { describe, it, expect } from "vitest";
import { composeK1ShareEmail, composeK1PinEmail, applyK1EmailEdit, mailtoUrl, PREVIEW_URL_PLACEHOLDER } from "./k1ShareEmail";

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

  it("never puts the PIN in the email — only a note that a second one is coming", () => {
    const e = composeK1ShareEmail({ ...base, documentCount: 1 });
    expect(e.body).toMatch(/separate email/i);
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

describe("composeK1PinEmail", () => {
  const pin = "409336";
  const e = composeK1PinEmail({ ownerName: "Lawrence Isard", pin });

  it("carries the PIN", () => {
    expect(e.body).toContain(pin);
    expect(e.subject).not.toContain(pin);   // subject lines show in notifications
  });

  it("carries NO link", () => {
    // The whole value of two messages once both go to the same mailbox: a
    // forwarded link email cannot open the document, and this one on its own
    // is a number with nothing to unlock.
    expect(e.body).not.toContain("/investor/");
    expect(e.body).not.toMatch(/https?:\/\//);
  });
});

describe("the two messages are disjoint", () => {
  it("the link email never carries the PIN, and the PIN email never carries the link", () => {
    const pin = "409336";
    const link = composeK1ShareEmail({ ...base, documentCount: 1 });
    const pinMail = composeK1PinEmail({ ownerName: base.ownerName, pin });
    expect(link.body).not.toContain(pin);
    expect(link.body).toContain(URL);
    expect(pinMail.body).toContain(pin);
    expect(pinMail.body).not.toContain(URL);
  });
});

describe("mailtoUrl", () => {
  const email = composeK1ShareEmail({ ...base, documentCount: 1 });

  it("opens the SAME message the portal would send", () => {
    // Not a second wording — the Outlook route and the portal route must not
    // drift into saying different things to the same investor.
    const url = mailtoUrl(email, ["larry@example.com"]);
    expect(decodeURIComponent(url)).toContain(email.subject);
    expect(decodeURIComponent(url)).toContain(URL);
  });

  it("addresses the recipient and carries cc separately", () => {
    const url = mailtoUrl(email, ["larry@example.com"], ["cpa@example.com"]);
    expect(url.startsWith("mailto:larry%40example.com?")).toBe(true);
    expect(decodeURIComponent(url)).toContain("cc=cpa@example.com");
  });

  it("percent-encodes spaces rather than using +", () => {
    // "+" in a mailto subject renders literally in Outlook, so "Your K-1"
    // would arrive as "Your+K-1".
    const url = mailtoUrl(email, ["larry@example.com"]);
    expect(url).not.toContain("+");
    expect(url).toContain("%20");
  });

  it("never carries the PIN — that stays a separate message", () => {
    const url = decodeURIComponent(mailtoUrl(email, ["larry@example.com"]));
    expect(url).not.toMatch(/\b\d{6}\b/);
  });
});

describe("the HTML alternative", () => {
  const e = composeK1ShareEmail({ ...base, documentCount: 1 });

  it("anchors the word 'link' instead of printing the URL", () => {
    // A K-1 token is ~200 characters; printed naked it wraps across three
    // lines and looks like something you shouldn't click.
    expect(e.html).toContain(`<a href="${URL}">link</a>`);
  });

  it("still carries the URL in the PLAIN TEXT body", () => {
    // The text part is always sent too: a message with no text alternative
    // scores worse with spam filters, and this one must not.
    expect(e.body).toContain(URL);
  });

  it("escapes property names rather than interpolating them raw", () => {
    const bad = composeK1ShareEmail({ ...base, propertyName: 'A & B <Center>', documentCount: 1 });
    expect(bad.html).toContain("A &amp; B &lt;Center&gt;");
    expect(bad.html).not.toContain("<Center>");
  });

  it("never carries the PIN in either part", () => {
    expect(e.html).not.toMatch(/\b\d{6}\b/);
    expect(e.body).not.toMatch(/\b\d{6}\b/);
  });
});

describe("a draft previewed before the link existed", () => {
  const canonical = composeK1ShareEmail({ ...base, documentCount: 1 });

  it("is NOT treated as an edit", () => {
    // The confirm posts its draft back. One composed around the placeholder
    // would otherwise be sent verbatim — putting a 404 under the word "link",
    // appending the real URL below the signature, marking the send "edited
    // wording", and dropping the HTML part.
    const preview = canonical.body.replace(URL, `https://portal.kormancommercial.com${PREVIEW_URL_PLACEHOLDER}`);
    const r = applyK1EmailEdit(canonical, { body: preview }, URL);
    expect(r.edited).toBe(false);
    expect(r.email.body).toBe(canonical.body);
    expect(r.email.body).toContain(URL);
    expect(r.email.body).not.toContain(PREVIEW_URL_PLACEHOLDER);
  });

  it("still honours a REAL edit made against a real link", () => {
    const r = applyK1EmailEdit(canonical, { body: `Larry — your K-1 is up.\n\n${URL}` }, URL);
    expect(r.edited).toBe(true);
    expect(r.email.body.startsWith("Larry")).toBe(true);
  });
});
