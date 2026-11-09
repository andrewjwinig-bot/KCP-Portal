import { describe, expect, it } from "vitest";
import { toEml } from "./receiptEml";

const base = {
  sentAt: "2026-11-09T15:04:05.000Z",
  from: "Tami Tomlinson, Korman Commercial Properties <ttomlinson@kormancommercial.com>",
  to: ["ap@tenant.com", "owner@tenant.com"],
  bcc: "ttomlinson@kormancommercial.com",
  replyTo: "ttomlinson@kormancommercial.com",
  subject: "Your payment of $1,250.00 — how we'll apply it",
  html: "<p>Hello — <b>table</b></p>",
  text: "Hello — table",
  messageId: "abc-123",
  attachment: { name: "Test_2026-11_Statement.pdf", contentType: "application/pdf", base64: Buffer.from("%PDF-1.4 test").toString("base64") },
};
const decodePart = (eml: string, type: string) => {
  const i = eml.indexOf(`Content-Type: ${type}`);
  const body = eml.slice(i).split("\r\n\r\n")[1].split("\r\n--")[0];
  return Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8");
};

describe("toEml — the archived receipt email as a message file", () => {
  it("carries every header that proves who was asked, when", () => {
    const eml = toEml(base);
    expect(eml).toMatch(/^Date: Mon, 09 Nov 2026 15:04:05 \+0000\r\n/);
    expect(eml).toContain("To: ap@tenant.com, owner@tenant.com\r\n");
    expect(eml).toContain("Bcc: ttomlinson@kormancommercial.com\r\n");
    expect(eml).toContain("Reply-To: ttomlinson@kormancommercial.com\r\n");
    expect(eml).toContain("X-PM-Message-Id: abc-123\r\n");
    // A non-ASCII subject is encoded, never sent raw in a header.
    expect(eml).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
  });
  it("keeps the HTML, the text and the statement exactly as sent", () => {
    const eml = toEml(base);
    expect(decodePart(eml, "text/html")).toBe(base.html);
    expect(decodePart(eml, "text/plain")).toBe(base.text);
    expect(decodePart(eml, "application/pdf")).toBe("%PDF-1.4 test");
    expect(eml).toContain('Content-Disposition: attachment; filename="Test_2026-11_Statement.pdf"');
  });
  it("without an attachment is a plain alternative message", () => {
    const eml = toEml({ ...base, attachment: null });
    expect(eml).not.toContain("multipart/mixed");
    expect(eml).toContain("multipart/alternative");
  });
  it("never lets a header value break onto a new line", () => {
    const eml = toEml({ ...base, subject: "Hi\r\nBcc: evil@x.com" });
    expect(eml).not.toContain("\r\nBcc: evil@x.com");
  });
});
