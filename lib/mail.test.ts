import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMail, sendMailDetailed, isMailTestMode } from "./mail";

/**
 * The Bcc plumbing, pinned.
 *
 * Investor K-1 sends blind-copy the team so there is a record that both the
 * link email and the PIN email actually left Postmark. If `bcc` silently
 * stopped reaching the payload, nothing would fail and no test would go red —
 * the copies would just quietly stop arriving, which is exactly the failure
 * the copies exist to catch.
 */
describe("sendMail", () => {
  const base = { to: "investor@example.com", subject: "Hi", textBody: "Body" };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.POSTMARK_SERVER_TOKEN = "test-token";
    process.env.MAINTENANCE_REPLY_FROM = "dwinig@kormancommercial.com";
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const payload = () => JSON.parse(fetchMock.mock.calls[0][1].body);

  it("passes bcc through to Postmark", async () => {
    await sendMail({ ...base, bcc: "dwinig@kormancommercial.com" });
    expect(payload().Bcc).toBe("dwinig@kormancommercial.com");
  });

  it("omits Bcc entirely when none is given", async () => {
    await sendMail(base);
    expect(payload()).not.toHaveProperty("Bcc");
  });

  it("keeps Bcc out of the visible recipients", async () => {
    // The investor must not see the internal address, or reply-all onto it.
    await sendMail({ ...base, bcc: "dwinig@kormancommercial.com" });
    const p = payload();
    expect(p.To).toBe("investor@example.com");
    expect(p.Cc).toBeUndefined();
  });

  it("carries cc and bcc independently", async () => {
    await sendMail({ ...base, cc: "marie@example.com", bcc: "drew@example.com" });
    expect(payload().Cc).toBe("marie@example.com");
    expect(payload().Bcc).toBe("drew@example.com");
  });
});

/**
 * The failure modes that made "Sent ✓" a lie.
 *
 * `sendMail` returned `res.ok` and discarded everything else, so a message
 * Postmark refused — and a message accepted by a TEST token and delivered
 * nowhere — were indistinguishable from a real send. The app then told
 * somebody their investor had been emailed.
 */
describe("sendMailDetailed", () => {
  const base = { to: "investor@example.com", subject: "Hi", textBody: "Body" };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.POSTMARK_SERVER_TOKEN = "real-token";
    process.env.MAINTENANCE_REPLY_FROM = "dwinig@kormancommercial.com";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });

  it("returns the Postmark message id on success", async () => {
    reply(200, { ErrorCode: 0, Message: "OK", MessageID: "abc-123" });
    const r = await sendMailDetailed(base);
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe("abc-123");
  });

  it("treats a 200 carrying a non-zero ErrorCode as a FAILURE", async () => {
    // Accepting this as success is how an undelivered message gets reported
    // as sent — the status code alone is not the answer.
    reply(200, { ErrorCode: 406, Message: "You tried to send to a recipient that has been marked as inactive." });
    const r = await sendMailDetailed(base);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/inactive/i);
  });

  it("surfaces Postmark's own words on a refusal", async () => {
    reply(422, { ErrorCode: 300, Message: "Invalid 'From' address." });
    const r = await sendMailDetailed(base);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Invalid 'From' address.");
  });

  it("flags a TEST token, which accepts everything and delivers nothing", async () => {
    process.env.POSTMARK_SERVER_TOKEN = "POSTMARK_API_TEST";
    reply(200, { ErrorCode: 0, MessageID: "test-1" });
    const r = await sendMailDetailed(base);
    expect(r.ok).toBe(true);
    expect(r.testMode).toBe(true);
  });

  it("names the missing configuration instead of failing silently", async () => {
    delete process.env.POSTMARK_SERVER_TOKEN;
    const r = await sendMailDetailed(base);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/POSTMARK_SERVER_TOKEN/);
  });

  it("keeps sendMail's boolean contract for existing callers", async () => {
    reply(200, { ErrorCode: 0, MessageID: "x" });
    expect(await sendMail(base)).toBe(true);
    reply(422, { ErrorCode: 300, Message: "nope" });
    expect(await sendMail(base)).toBe(false);
  });
});

describe("isMailTestMode", () => {
  afterEach(() => { delete process.env.POSTMARK_SERVER_TOKEN; });
  it("recognises the test token, case- and space-insensitively", () => {
    process.env.POSTMARK_SERVER_TOKEN = " postmark_api_test ";
    expect(isMailTestMode()).toBe(true);
  });
  it("is false for a real token", () => {
    process.env.POSTMARK_SERVER_TOKEN = "a1b2c3";
    expect(isMailTestMode()).toBe(false);
  });
});
