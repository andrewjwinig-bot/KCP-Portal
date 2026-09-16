import { describe, it, expect } from "vitest";
import { composeK1ShareEmail, composeK1PinEmail, applyK1EmailEdit, mailtoUrl, PREVIEW_URL_PLACEHOLDER, applyK1PinEdit } from "./k1ShareEmail";

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

describe("applyK1PinEdit — the PIN email is editable, the PIN is not losable", () => {
  const canonical = composeK1PinEmail({ ownerName: "Susan Korman Schurr", pin: "477860" });

  it("leaves the canonical message alone when nothing was typed", () => {
    expect(applyK1PinEdit(canonical, null, "477860").edited).toBe(false);
    expect(applyK1PinEdit(canonical, { subject: "", body: "" }, "477860").email).toEqual(canonical);
  });

  it("takes a rewritten body that still carries the PIN", () => {
    const body = "Hi Susan,\n\nYour PIN is 477860.\n\n— KCP";
    const out = applyK1PinEdit(canonical, { body }, "477860");
    expect(out.edited).toBe(true);
    expect(out.email.body).toBe(body);
  });

  it("appends the PIN back when an edit drops it", () => {
    // The one thing an edit here can get wrong. An investor holding a link
    // with no PIN cannot open the document at all.
    const out = applyK1PinEdit(canonical, { body: "Hi Susan, here you go. — KCP" }, "477860");
    expect(out.email.body).toContain("477860");
  });

  it("takes a rewritten subject", () => {
    const out = applyK1PinEdit(canonical, { subject: "Your PIN" }, "477860");
    expect(out.email.subject).toBe("Your PIN");
    expect(out.email.body).toBe(canonical.body);
  });

  it("still carries no link, whatever was typed", () => {
    // The split is the whole point: neither message on its own opens the
    // document, so a forwarded email hands over nothing.
    const out = applyK1PinEdit(canonical, { body: "Your PIN is 477860" }, "477860");
    expect(out.email.body).not.toMatch(/https?:\/\//);
  });
});

describe("the message is addressed to whoever is actually being mailed", () => {
  const base = { ownerName: "Jeffrey Honickman", propertyName: "Parkwood", documentCount: 6, taxYear: 2025, url: "https://x/y" };

  it("greets by FIRST name only", () => {
    const e = composeK1ShareEmail({ ...base, greetNames: ["Antoinette Czop"], onBehalf: true });
    expect(e.body).toMatch(/^Hello Antoinette,/);
    expect(e.body).not.toContain("Hello Antoinette Czop,");
  });

  it("leaves a company or a trust its full name", () => {
    // "Hello Hyman," and "Hello Berton," (a trust in a dead man's name) address
    // something that is not the recipient.
    expect(composeK1ShareEmail({ ...base, greetNames: ["Hyman Korman Co."] }).body).toMatch(/^Hello Hyman Korman Co\.,/);
    expect(composeK1ShareEmail({ ...base, greetNames: ["The Korman Co"] }).body).toMatch(/^Hello The Korman Co,/);
  });

  it("joins two recipients", () => {
    const e = composeK1ShareEmail({ ...base, greetNames: ["Antoinette Czop", "Jeffrey Honickman"] });
    expect(e.body).toMatch(/^Hello Antoinette and Jeffrey,/);
  });

  it("falls back to a bare Hello with no names — what every send did before", () => {
    expect(composeK1ShareEmail(base).body).toMatch(/^Hello,/);
  });

  it("names the investor as the SUBJECT when the mail is not to them", () => {
    // "Your 6 Schedule K-1s" to someone who holds none of them is the sentence
    // that makes a recipient check whether the mail is real.
    const e = composeK1ShareEmail({ ...base, greetNames: ["Antoinette Czop"], onBehalf: true });
    expect(e.subject).toBe("Jeffrey Honickman's 2025 Schedule K-1s — Korman Commercial Properties");
    expect(e.body).toContain("Jeffrey Honickman's 6 Schedule K-1s are ready in their secure investor portal");
    expect(e.body).toContain("This link is private to Jeffrey Honickman.");
    expect(e.body).not.toContain("Your 6 Schedule K-1s");
  });

  it("keeps the second-person wording when the investor IS a recipient", () => {
    const e = composeK1ShareEmail({ ...base, greetNames: ["Jeffrey Honickman"] });
    expect(e.subject).toBe("Your 2025 Schedule K-1s — Korman Commercial Properties");
    expect(e.body).toContain("Your 6 Schedule K-1s are ready in your secure investor portal");
  });

  it("carries the same addressing into the HTML alternative", () => {
    // The HTML rides along on an unedited send, so a greeting that differed
    // between the two parts would reach whichever the client rendered.
    const e = composeK1ShareEmail({ ...base, greetNames: ["Antoinette Czop"], onBehalf: true });
    expect(e.html).toContain("<p>Hello Antoinette,</p>");
    expect(e.html).toContain("Jeffrey Honickman&#039;s 6 Schedule K-1s".replace("&#039;", "'"));
  });

  it("addresses the PIN email the same way, and says whose PIN it is", () => {
    const p = composeK1PinEmail({ ownerName: "Jeffrey Honickman", pin: "825074", greetNames: ["Antoinette Czop"], onBehalf: true });
    expect(p.body).toMatch(/^Hello Antoinette,/);
    expect(p.body).toContain("Jeffrey Honickman's secure investor portal link");
    expect(p.body).toContain("825074");
    // Still no link — the two messages stay disjoint whoever they go to.
    expect(p.body).not.toMatch(/https?:\/\//);
  });

  it("greets the investor by first name on their own PIN email", () => {
    const p = composeK1PinEmail({ ownerName: "Jeffrey Honickman", pin: "825074" });
    expect(p.body).toMatch(/^Hello Jeffrey,/);
  });
});
