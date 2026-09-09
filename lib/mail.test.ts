import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMail } from "./mail";

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
